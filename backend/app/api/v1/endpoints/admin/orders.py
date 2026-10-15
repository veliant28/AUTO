import re
import secrets
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy.orm import joinedload, selectinload
from sqlalchemy import func, case, or_
from app.core.db import get_db
from app.core.security import get_password_hash
from app.api.v1.deps import require_permission
from app.schemas.admin_schemas import (
    AdminOrderItem, AdminAdminOrderListResponse,
    UpdateOrderStatusSchema,
    AdminOrderDetailResponse, AdminOrderItemSchema,
    AdminOrderUpdateSchema, AdminOrderAddItemSchema,
    AdminOrderCreateSchema, AdminOrderProductItem, AdminOrderProductSearchResponse,
    OrderChangeLogResponse, UnifiedEventResponse,
)
from app.schemas.tecdoc_schemas import AdminOfferItem
from app.models import User, Order, OrderItem, OrderStatus, OrderChangeLog, Part, Role
from app.models.suppliers import SupplierOffer, Supplier
from app.models.loyalty import Promocode
from app.models.nova_poshta import OrderNovaPoshtaWaybillEvent, OrderNovaPoshtaWaybill, OrderNovaPoshtaWaybillSeat
from app.models.returns import ReturnRequest, ReturnStatus
from datetime import datetime
from app.services.catalog_utils import best_offer, b2b_margin_for_user
from app.services.client_index import compute_client_index_stats
from app.services.promocode_service import (
    find_customer_by_phone,
    phone_digits,
    promocode_allowed_for,
)
from app.services.notifications import send_telegram_notification, send_customer_telegram_notification
from app.services import telegram_format

router = APIRouter()

# Учётка, которую заводим клиенту, оформившему заказ по телефону без регистрации
PHONE_CUSTOMER_EMAIL_DOMAIN = "phone.svom.local"

# Статусы, в которых заказ уже нельзя менять
EDIT_LOCKED_STATUSES = {"shipped", "delivered", "cancelled"}


def _actor_name(user: User) -> str:
    """Имя сотрудника для истории: «Фамилия Имя» (как в остальных записях),
    с откатом на полное имя и почту."""
    composed = f"{user.last_name or ''} {user.first_name or ''}".strip()
    return composed or user.full_name or user.email


def _phone_digits(phone: str | None) -> str:
    return re.sub(r"\D", "", phone or "")


def _load_order_for_detail(db: Session, order_id: int) -> Order | None:
    return db.query(Order).options(
        joinedload(Order.items).joinedload(OrderItem.part)
        .selectinload(Part.offers).joinedload(SupplierOffer.supplier),
        joinedload(Order.items).selectinload(OrderItem.supplier_offer).joinedload(SupplierOffer.supplier),
        joinedload(Order.updated_by),
    ).filter(Order.id == order_id).first()


def _serialize_order_detail(db: Session, order: Order) -> AdminOrderDetailResponse:
    """Полная деталь заказа — тот же формат, что отдаёт GET /admin/orders/{id}."""
    user_id = order.user_id
    # Индекс успешности — общая формула (services.client_index): как в карточке
    # клиента и таблице пользователей
    index_stats = compute_client_index_stats(db, user_id)
    user_total_orders = index_stats["total_orders"]
    user_success_index = index_stats["success_index"]

    return AdminOrderDetailResponse(
        id=order.id,
        order_number=order.order_number or f"ORD-{order.id:010d}",
        user_id=order.user_id,
        status=order.status.value if hasattr(order.status, "value") else order.status,
        total=float(order.total),
        full_name=order.full_name,
        phone=order.phone,
        address=order.address,
        last_name=order.last_name,
        first_name=order.first_name,
        middle_name=order.middle_name,
        delivery_type=order.delivery_type,
        delivery_city=order.delivery_city,
        delivery_warehouse=order.delivery_warehouse,
        delivery_city_ref=order.delivery_city_ref,
        delivery_settlement_ref=order.delivery_settlement_ref,
        delivery_city_label=order.delivery_city_label,
        delivery_warehouse_ref=order.delivery_warehouse_ref,
        delivery_warehouse_label=order.delivery_warehouse_label,
        delivery_street_ref=order.delivery_street_ref,
        delivery_street_label=order.delivery_street_label,
        delivery_house=order.delivery_house,
        delivery_apartment=order.delivery_apartment,
        promocode_code=order.promocode_code,
        discount_amount=float(order.discount_amount or 0),
        original_total=float(order.original_total or 0) if order.original_total else None,
        payment_method=order.payment_method,
        created_at=order.created_at,
        updated_by_name=order.updated_by_name,
        updated_by_group=order.updated_by_group,
        updated_at=order.updated_at,
        user_success_index=user_success_index,
        user_total_orders=user_total_orders,
        items=[
            AdminOrderItemSchema(
                id=item.id,
                part_id=item.part_id,
                article=item.part.article,
                part_name=item.part.name,
                brand=item.part.brand,
                quantity=item.quantity,
                price=float(item.price),
                sku=item.part.sku,
                image_url=item.part.image_url,
                supplier_name=item.supplier_offer.supplier.name if item.supplier_offer and item.supplier_offer.supplier else None,
                offers=[
                    AdminOfferItem(
                        supplier_name=offer.supplier.name,
                        price=float(offer.price),
                        final_price=float(offer.final_price) if offer.final_price else None,
                        currency=offer.currency,
                        quantity=offer.quantity,
                    )
                    for offer in (item.part.offers or [])
                ],
            )
            for item in order.items
        ],
    )


def _find_or_create_customer(
    db: Session,
    *,
    phone: str,
    last_name: str,
    first_name: str,
    middle_name: str | None,
) -> tuple[User, bool]:
    """Заказ всегда привязан к пользователю: ищем клиента по телефону, а если его нет —
    заводим учётку, чтобы телефонный заказ был виден в его личном кабинете после регистрации."""
    digits = _phone_digits(phone)
    existing_customer = find_customer_by_phone(db, phone)
    if existing_customer:
        return existing_customer, False

    email = f"{digits or 'unknown'}@{PHONE_CUSTOMER_EMAIL_DOMAIN}"
    existing = db.query(User).filter(User.email == email).first()
    if existing:
        return existing, False

    role = db.query(Role).filter(Role.name == "retail").first() or db.query(Role).order_by(Role.id).first()
    if not role:
        raise HTTPException(400, "Роль для клиента не настроена")

    full_name = " ".join(p for p in (last_name, first_name, middle_name) if p) or None
    user = User(
        email=email,
        password_hash=get_password_hash(secrets.token_urlsafe(24)),
        full_name=full_name,
        first_name=first_name or None,
        last_name=last_name or None,
        middle_name=middle_name or None,
        phone=("+" + digits) if digits else None,
        is_active=True,
        role_id=role.id,
        created_at=datetime.utcnow().isoformat(),
    )
    db.add(user)
    db.flush()
    return user, True


@router.get("/orders", response_model=AdminAdminOrderListResponse)
async def list_orders(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=500),
    status: str = Query("", max_length=50),
    search: str = Query("", max_length=100),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("orders.view")),
):
    """Список заказов для админ-панели с пагинацией, фильтром по статусу и поиском."""
    query = db.query(Order)
    if status:
        try:
            query = query.filter(Order.status == OrderStatus(status))
        except ValueError:
            pass
    if search:
        like = f"%{search}%"
        try:
            search_id = int(search)
            query = query.filter(
                (Order.id == search_id) |
                (Order.order_number.ilike(like)) |
                (Order.full_name.ilike(like)) |
                (Order.last_name.ilike(like)) |
                (Order.first_name.ilike(like)) |
                (Order.middle_name.ilike(like)) |
                (Order.phone.ilike(like))
            )
        except ValueError:
            query = query.filter(
                (Order.order_number.ilike(like)) |
                (Order.full_name.ilike(like)) |
                (Order.last_name.ilike(like)) |
                (Order.first_name.ilike(like)) |
                (Order.middle_name.ilike(like)) |
                (Order.phone.ilike(like))
            )
    total = query.count()
    orders = query.order_by(Order.created_at.desc()).offset((page - 1) * page_size).limit(page_size).all()
    return AdminAdminOrderListResponse(
        items=[
            AdminOrderItem(
                id=o.id,
                order_number=o.order_number or f"ORD-{o.id:010d}",
                user_id=o.user_id,
                status=o.status.value if hasattr(o.status, "value") else o.status,
                total=float(o.total),
                full_name=o.full_name,
                phone=o.phone,
                address=o.address,
                created_at=o.created_at,
                items_count=len(o.items),
            )
            for o in orders
        ],
        total=total,
        page=page,
        page_size=page_size,
    )


@router.get("/orders/product-search", response_model=AdminOrderProductSearchResponse)
async def search_order_products(
    q: str = Query(..., min_length=2, max_length=100),
    limit: int = Query(15, ge=1, le=50),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("orders.edit_status")),
):
    """Поиск товаров для добавления в заказ: «бренд + артикул», «бренд + SKU» либо артикул/SKU."""
    query = q.strip()
    if len(query) < 2:
        return AdminOrderProductSearchResponse(items=[])

    tokens = [t for t in re.split(r"\s+", query) if t]
    brand_part = " ".join(tokens[:-1]) if len(tokens) >= 2 else None
    code_part = tokens[-1]
    code_like = f"%{code_part}%"
    code_lower = code_part.lower()

    base = db.query(Part).options(
        selectinload(Part.offers).joinedload(SupplierOffer.supplier),
    ).filter(Part.is_active == True)  # noqa: E712

    def rank_and_limit(statement):
        sku_col = func.coalesce(Part.sku, "")
        return statement.order_by(
            case(
                (func.lower(Part.article) == code_lower, 0),
                (func.lower(sku_col) == code_lower, 1),
                (Part.article.ilike(f"{code_part}%"), 2),
                (sku_col.ilike(f"{code_part}%"), 3),
                else_=4,
            ),
            Part.article,
        ).limit(limit)

    parts = []
    if brand_part:
        parts = rank_and_limit(
            base.filter(Part.brand.ilike(f"%{brand_part}%")).filter(
                or_(Part.article.ilike(code_like), func.coalesce(Part.sku, "").ilike(code_like))
            )
        ).all()
    if not parts:
        # Без бренда (или бренд не совпал) — ищем по артикулу/SKU/названию
        parts = rank_and_limit(
            base.filter(
                or_(
                    Part.article.ilike(code_like),
                    func.coalesce(Part.sku, "").ilike(code_like),
                    Part.name.ilike(f"%{query}%"),
                )
            )
        ).all()

    items = []
    for part in parts:
        best = best_offer(part.offers or [])
        if not best or best.get("price") is None:
            # Без оффера нельзя посчитать цену позиции заказа
            continue
        items.append(
            AdminOrderProductItem(
                part_id=part.id,
                article=part.article,
                brand=part.brand,
                name=part.name,
                sku=part.sku,
                image_url=part.image_url,
                price=best.get("price"),
                currency=best.get("currency"),
                quantity=best.get("quantity") or 0,
                supplier_name=best.get("supplier_name"),
                supplier_offer_id=best.get("supplier_offer_id"),
            )
        )
    return AdminOrderProductSearchResponse(items=items)


@router.post("/orders", response_model=AdminOrderDetailResponse)
async def create_order(
    data: AdminOrderCreateSchema,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("orders.edit_status")),
):
    """Создание заказа администратором (заказ по телефону, без витрины)."""
    if not data.items:
        raise HTTPException(400, "В заказе должна быть хотя бы одна позиция")

    # Способ оплаты обязателен: счета/наложка зависят от него
    from app.services.payments.service import PAYMENT_METHOD_NAMES
    if data.payment_method not in PAYMENT_METHOD_NAMES:
        raise HTTPException(400, "Выберите способ оплаты")

    # Заказ оформляется на доставку: без способа и адреса его не отправить
    if data.delivery_type not in ("warehouse", "courier"):
        raise HTTPException(400, "Выберите способ доставки")
    if data.delivery_type == "warehouse":
        if not (data.delivery_city_ref and data.delivery_warehouse_ref):
            raise HTTPException(400, "Укажите город и отделение Новой Почты")
    elif not (
        data.delivery_city_ref
        and data.delivery_street_ref
        and (data.delivery_house or "").strip()
    ):
        raise HTTPException(400, "Укажите город, улицу и дом для курьерской доставки")

    merged: dict[int, int] = {}
    for item in data.items:
        merged[item.part_id] = merged.get(item.part_id, 0) + max(1, int(item.quantity))

    parts = db.query(Part).options(
        selectinload(Part.offers).joinedload(SupplierOffer.supplier),
    ).filter(Part.id.in_(list(merged.keys()))).all()
    parts_by_id = {p.id: p for p in parts}
    for part_id in merged:
        if part_id not in parts_by_id:
            raise HTTPException(400, f"Товар не найден: {part_id}")

    phone_digits = _phone_digits(data.phone)
    customer, customer_created = _find_or_create_customer(
        db,
        phone=data.phone,
        last_name=data.last_name,
        first_name=data.first_name,
        middle_name=data.middle_name,
    )

    # Цену берём из БД (лучший оффер), а не из тела запроса; для клиента
    # с ролью b2b — от закупки с B2B-наценкой (как на витрине)
    b2b_margin = b2b_margin_for_user(db, customer.id)
    resolved: list[tuple[Part, int, float, int | None]] = []
    for part_id, quantity in merged.items():
        part = parts_by_id[part_id]
        best = best_offer(part.offers or [], b2b_margin=b2b_margin)
        if not best or best.get("price") is None:
            raise HTTPException(400, f"Для товара «{part.article}» нет доступной цены")
        resolved.append((part, quantity, float(best["price"]), best.get("supplier_offer_id")))

    total = round(sum(quantity * price for _, quantity, price, _ in resolved), 2)
    original_total = total

    promocode = None
    discount_amount = 0.0
    if data.promocode:
        code = data.promocode.strip().upper()
        promocode = db.query(Promocode).filter(Promocode.code == code).first()
        if not promocode:
            raise HTTPException(400, "Промокод не найден")
        if not promocode.is_active:
            raise HTTPException(400, "Промокод неактивен")
        if promocode.expires_at and promocode.expires_at < datetime.utcnow():
            raise HTTPException(400, "Срок действия промокода истёк")
        if promocode.used_at:
            raise HTTPException(400, "Промокод уже использован")
        # Код выдан конкретному человеку: применить его может только этот клиент
        # (если он зарегистрирован) или сотрудник, оформляющий заказ
        if not promocode_allowed_for(
            promocode,
            client_user_id=customer.id,
            actor_user_id=current_user.id,
        ):
            raise HTTPException(400, "Промокод принадлежит другому пользователю")
        if promocode.type == "margin":
            total_margin = 0.0
            for part, quantity, price, _ in resolved:
                best = best_offer(part.offers or [])
                base_price = float(best["original_price"]) if best else 0.0
                margin_per_item = price - base_price
                if margin_per_item > 0:
                    total_margin += margin_per_item * quantity
            if total_margin > 0:
                discount_amount = round(total_margin * (promocode.discount_percent or 100) / 100, 2)
                total = max(round(total - discount_amount, 2), 0.0)
        promocode.used_at = datetime.utcnow()

    actor_name = _actor_name(current_user)
    actor_group = current_user.role.name if current_user.role else None

    order = Order(
        user_id=customer.id,
        status=OrderStatus.PENDING,
        total=total,
        full_name=" ".join(filter(None, [data.last_name, data.first_name, data.middle_name])),
        phone=("+" + phone_digits) if phone_digits else data.phone,
        last_name=data.last_name,
        first_name=data.first_name,
        middle_name=data.middle_name,
        delivery_type=data.delivery_type,
        delivery_city=data.delivery_city,
        delivery_warehouse=data.delivery_warehouse,
        delivery_city_ref=data.delivery_city_ref,
        delivery_settlement_ref=data.delivery_settlement_ref,
        delivery_city_label=data.delivery_city_label,
        delivery_warehouse_ref=data.delivery_warehouse_ref,
        delivery_warehouse_label=data.delivery_warehouse_label,
        delivery_street_ref=data.delivery_street_ref,
        delivery_street_label=data.delivery_street_label,
        delivery_house=data.delivery_house,
        delivery_apartment=data.delivery_apartment,
        payment_method=data.payment_method,
        promocode_id=promocode.id if promocode else None,
        promocode_code=promocode.code if promocode else None,
        discount_amount=discount_amount,
        original_total=original_total,
        updated_by_user_id=current_user.id,
        updated_by_name=actor_name,
        updated_by_group=actor_group,
        updated_at=datetime.utcnow(),
    )
    db.add(order)
    db.flush()
    order.order_number = f"ORD-{order.id:010d}"

    for part, quantity, price, supplier_offer_id in resolved:
        db.add(
            OrderItem(
                order_id=order.id,
                part_id=part.id,
                quantity=quantity,
                price=price,
                supplier_offer_id=supplier_offer_id,
            )
        )

    # Действие "create" означает, что заказ оформлен сотрудником из админки
    # (витринное оформление записи в историю не пишет) — админка показывает по
    # этому признаку отдельную метку в таймлайне
    details = [
        f"{len(resolved)} поз. на {total} ₴",
        f"получатель: {order.full_name}, {order.phone}",
    ]
    if data.delivery_type:
        destination = data.delivery_warehouse or data.delivery_street_label or data.delivery_city or ""
        details.append(f"доставка: {data.delivery_type} {destination}".strip())
    if data.payment_method:
        details.append(f"оплата: {data.payment_method}")
    if promocode:
        details.append(f"промокод: {promocode.code} (-{discount_amount} ₴)")
    if customer_created:
        details.append("клиент заведён по номеру телефона")

    db.add(
        OrderChangeLog(
            order_id=order.id,
            user_id=current_user.id,
            user_name=actor_name,
            user_group=actor_group,
            action="create",
            details="; ".join(details),
            created_at=datetime.utcnow(),
        )
    )
    db.commit()

    # Telegram-уведомления как при обычном оформлении (fire-and-forget)
    import asyncio
    asyncio.ensure_future(
        send_telegram_notification(
            telegram_format.new_order(
                number=order.order_number,
                total=order.total,
                full_name=order.full_name,
                phone=order.phone,
            )
        )
    )
    asyncio.ensure_future(
        send_customer_telegram_notification(
            order.user_id,
            telegram_format.customer_new_order(order.order_number, order.total),
        )
    )

    created_order = _load_order_for_detail(db, order.id)
    return _serialize_order_detail(db, created_order)


@router.get("/orders/{order_id}", response_model=AdminOrderDetailResponse)
async def get_order_detail(
    order_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("orders.view")),
):
    """Детальная информация о заказе для админ-панели."""
    order = _load_order_for_detail(db, order_id)
    if not order:
        raise HTTPException(404, "Order not found")
    return _serialize_order_detail(db, order)


@router.put("/orders/{order_id}")
async def update_order(
    order_id: int,
    data: AdminOrderUpdateSchema,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("orders.edit_status")),
):
    """Обновить заказ: товары, контактные данные, доставку."""
    order = db.query(Order).filter(Order.id == order_id).first()
    if not order:
        raise HTTPException(404, "Order not found")

    # Отправленный, доставленный и отменённый заказ правит только администратор
    role_name = current_user.role.name if current_user.role else ""
    order_status = order.status.value if hasattr(order.status, "value") else order.status
    if order_status in EDIT_LOCKED_STATUSES and role_name != "admin":
        raise HTTPException(400, "Заказ в этом статусе может изменить только администратор")

    changes = []

    if data.items is not None:
        for upd in data.items:
            item = db.query(OrderItem).options(joinedload(OrderItem.part)).filter(OrderItem.id == upd.id, OrderItem.order_id == order_id).first()
            if item and item.quantity != upd.quantity:
                part_base = f"{item.part.name} {item.part.article}" if item.part else f"товар #{item.id}"
                changes.append(f"{part_base}: {item.quantity} шт. → {upd.quantity} шт.")
                item.quantity = upd.quantity

        # Recalculate total after quantity changes (скидка промокода сохраняется)
        db.flush()
        order.total = max(
            sum(float(i.quantity) * float(i.price) for i in order.items)
            - float(order.discount_amount or 0),
            0,
        )

    if data.add_items:
        # Клиент заказа с ролью b2b — новые позиции тоже по B2B-наценке
        b2b_margin = b2b_margin_for_user(db, order.user_id)
        for add in data.add_items:
            part = db.query(Part).options(
                selectinload(Part.offers).joinedload(SupplierOffer.supplier)
            ).filter(Part.id == add.part_id).first()
            if not part:
                raise HTTPException(400, f"Товар не найден: {add.part_id}")
            best = best_offer(part.offers or [], b2b_margin=b2b_margin)
            if not best or best.get("price") is None:
                raise HTTPException(400, f"Для товара «{part.article}» нет доступной цены")

            quantity = max(1, int(add.quantity))
            existing = db.query(OrderItem).filter(
                OrderItem.order_id == order_id, OrderItem.part_id == part.id
            ).first()
            if existing:
                changes.append(
                    f"{part.name} {part.article}: {existing.quantity} шт. → {existing.quantity + quantity} шт."
                )
                existing.quantity += quantity
            else:
                changes.append(
                    f"добавлен товар: {part.name} {part.article}: {quantity} шт. × {float(best['price'])} ₴"
                )
                db.add(OrderItem(
                    order_id=order.id,
                    part_id=part.id,
                    quantity=quantity,
                    price=float(best["price"]),
                    supplier_offer_id=best.get("supplier_offer_id"),
                ))

        # Пересчитываем сумму по всем позициям заказа (за вычетом скидки)
        db.flush()
        order.total = max(
            sum(
                float(i.quantity) * float(i.price)
                for i in db.query(OrderItem).filter(OrderItem.order_id == order.id).all()
            )
            - float(order.discount_amount or 0),
            0,
        )

    if data.phone is not None and order.phone != data.phone:
        changes.append(f"телефон: {order.phone} → {data.phone}")
        order.phone = data.phone
    if data.last_name is not None and order.last_name != data.last_name:
        changes.append(f"фамилия: {order.last_name or ''} → {data.last_name}")
        order.last_name = data.last_name
    if data.first_name is not None and order.first_name != data.first_name:
        changes.append(f"имя: {order.first_name or ''} → {data.first_name}")
        order.first_name = data.first_name
    if data.middle_name is not None and order.middle_name != data.middle_name:
        changes.append(f"отчество: {order.middle_name or ''} → {data.middle_name}")
        order.middle_name = data.middle_name
    if data.delivery_type is not None and order.delivery_type != data.delivery_type:
        changes.append(f"доставка: {order.delivery_type or ''} → {data.delivery_type}")
        order.delivery_type = data.delivery_type
    if data.delivery_city is not None and order.delivery_city != data.delivery_city:
        changes.append(f"город: {order.delivery_city or ''} → {data.delivery_city}")
        order.delivery_city = data.delivery_city
    if data.delivery_warehouse is not None and order.delivery_warehouse != data.delivery_warehouse:
        changes.append(f"отделение: {order.delivery_warehouse or ''} → {data.delivery_warehouse}")
        order.delivery_warehouse = data.delivery_warehouse
    if data.delivery_city_ref is not None and order.delivery_city_ref != data.delivery_city_ref:
        order.delivery_city_ref = data.delivery_city_ref
    if data.delivery_settlement_ref is not None and order.delivery_settlement_ref != data.delivery_settlement_ref:
        order.delivery_settlement_ref = data.delivery_settlement_ref
    if data.delivery_city_label is not None and order.delivery_city_label != data.delivery_city_label:
        order.delivery_city_label = data.delivery_city_label
    if data.delivery_warehouse_ref is not None and order.delivery_warehouse_ref != data.delivery_warehouse_ref:
        order.delivery_warehouse_ref = data.delivery_warehouse_ref
    if data.delivery_warehouse_label is not None and order.delivery_warehouse_label != data.delivery_warehouse_label:
        order.delivery_warehouse_label = data.delivery_warehouse_label
    if data.delivery_street_ref is not None and order.delivery_street_ref != data.delivery_street_ref:
        order.delivery_street_ref = data.delivery_street_ref
    if data.delivery_street_label is not None and order.delivery_street_label != data.delivery_street_label:
        order.delivery_street_label = data.delivery_street_label
    if data.delivery_house is not None and order.delivery_house != data.delivery_house:
        order.delivery_house = data.delivery_house
    if data.delivery_apartment is not None and order.delivery_apartment != data.delivery_apartment:
        order.delivery_apartment = data.delivery_apartment

    # Handle promocode removal (explicitly check for None/Optional fields)
    if 'promocode_code' in data.model_dump(exclude_unset=True):
        old_code = order.promocode_code
        order.promocode_code = data.promocode_code

        # Sync promocode used_at: set when applied, clear when removed
        if data.promocode_code:
            pc = db.query(Promocode).filter(Promocode.code == data.promocode_code).first()
            if pc and not promocode_allowed_for(
                pc,
                client_user_id=order.user_id,
                actor_user_id=current_user.id,
            ):
                raise HTTPException(400, "Промокод принадлежит другому пользователю")
            if pc and not pc.used_at:
                pc.used_at = datetime.utcnow()
        elif old_code:
            pc = db.query(Promocode).filter(Promocode.code == old_code).first()
            if pc:
                pc.used_at = None
    if 'discount_amount' in data.model_dump(exclude_unset=True):
        order.discount_amount = data.discount_amount or 0
    if 'original_total' in data.model_dump(exclude_unset=True):
        order.original_total = data.original_total
    if 'total' in data.model_dump(exclude_unset=True):
        order.total = data.total

    if changes:
        order.updated_by_user_id = current_user.id
        order.updated_by_name = _actor_name(current_user)
        order.updated_by_group = role_name
        order.updated_at = datetime.utcnow()

        log = OrderChangeLog(
            order_id=order.id,
            user_id=current_user.id,
            user_name=_actor_name(current_user),
            user_group=role_name,
            action="edit",
            details="; ".join(changes),
        )
        db.add(log)

    db.commit()
    return {"message": "Order updated", "changes": changes}


@router.delete("/orders/{order_id}/items/{item_id}", response_model=AdminOrderDetailResponse)
async def delete_order_item(
    order_id: int,
    item_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("orders.delete")),
):
    """Удалить товар из заказа. Пересчитывает итоговую сумму."""
    order = db.query(Order).filter(Order.id == order_id).first()
    if not order:
        raise HTTPException(404, "Order not found")

    item = db.query(OrderItem).options(joinedload(OrderItem.part)).filter(
        OrderItem.id == item_id, OrderItem.order_id == order_id
    ).first()
    if not item:
        raise HTTPException(404, "Order item not found")

    item_info = f"{item.part.name} {item.part.article}"

    db.delete(item)
    db.flush()

    remaining = db.query(OrderItem).options(joinedload(OrderItem.part)).filter(
        OrderItem.order_id == order_id
    ).all()

    order.total = sum(float(i.quantity) * float(i.price) for i in remaining)
    role_name = current_user.role.name if current_user.role else ""
    order.updated_by_user_id = current_user.id
    order.updated_by_name = _actor_name(current_user)
    order.updated_by_group = role_name
    order.updated_at = datetime.utcnow()

    log = OrderChangeLog(
        order_id=order.id,
        user_id=current_user.id,
        user_name=_actor_name(current_user),
        user_group=role_name,
        action="item_removed",
        details=item_info,
    )
    db.add(log)
    db.commit()

    return AdminOrderDetailResponse(
        id=order.id,
        order_number=order.order_number or f"ORD-{order.id:010d}",
        user_id=order.user_id,
        status=order.status.value if hasattr(order.status, "value") else order.status,
        total=float(order.total),
        full_name=order.full_name,
        phone=order.phone,
        address=order.address,
        last_name=order.last_name,
        first_name=order.first_name,
        middle_name=order.middle_name,
        delivery_type=order.delivery_type,
        delivery_city=order.delivery_city,
        delivery_warehouse=order.delivery_warehouse,
        delivery_city_ref=order.delivery_city_ref,
        delivery_settlement_ref=order.delivery_settlement_ref,
        delivery_city_label=order.delivery_city_label,
        delivery_warehouse_ref=order.delivery_warehouse_ref,
        delivery_warehouse_label=order.delivery_warehouse_label,
        delivery_street_ref=order.delivery_street_ref,
        delivery_street_label=order.delivery_street_label,
        delivery_house=order.delivery_house,
        delivery_apartment=order.delivery_apartment,
        promocode_code=order.promocode_code,
        discount_amount=float(order.discount_amount or 0),
        original_total=float(order.original_total or 0) if order.original_total else None,
        payment_method=order.payment_method,
        created_at=order.created_at,
        updated_by_name=order.updated_by_name,
        updated_by_group=order.updated_by_group,
        updated_at=order.updated_at,
        items=[
            AdminOrderItemSchema(
                id=i.id,
                part_id=i.part_id,
                article=i.part.article,
                part_name=i.part.name,
                brand=i.part.brand,
                quantity=i.quantity,
                price=float(i.price),
                sku=i.part.sku,
            )
            for i in remaining
        ],
    )


@router.delete("/orders/{order_id}")
async def delete_order(
    order_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("orders.delete")),
):
    """Полностью удалить заказ вместе с товарами, изменениями и ТТН."""
    order = db.query(Order).filter(Order.id == order_id).first()
    if not order:
        raise HTTPException(404, "Order not found")

    # Delete TTN (waybill + seats + events)
    waybill = db.query(OrderNovaPoshtaWaybill).filter(
        OrderNovaPoshtaWaybill.order_id == order_id
    ).first()
    if waybill:
        db.query(OrderNovaPoshtaWaybillEvent).filter(
            OrderNovaPoshtaWaybillEvent.waybill_id == waybill.id
        ).delete()
        db.query(OrderNovaPoshtaWaybillSeat).filter(
            OrderNovaPoshtaWaybillSeat.waybill_id == waybill.id
        ).delete()
        db.delete(waybill)

    # Delete change logs
    db.query(OrderChangeLog).filter(OrderChangeLog.order_id == order_id).delete()

    # Delete order items
    db.query(OrderItem).filter(OrderItem.order_id == order_id).delete()

    db.delete(order)
    db.commit()
    return {"ok": True}


@router.post("/orders/{order_id}/items", response_model=AdminOrderDetailResponse)
async def add_order_item(
    order_id: int,
    data: AdminOrderAddItemSchema,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("orders.edit_status")),
):
    """Добавить товар в заказ. Только для заказов со статусом 'В обработке'."""
    order = db.query(Order).options(
        joinedload(Order.items).joinedload(OrderItem.part),
    ).filter(Order.id == order_id).first()
    if not order:
        raise HTTPException(404, "Order not found")
    if order.status != OrderStatus.PROCESSING:
        raise HTTPException(400, "Товар можно добавить только в заказ со статусом 'В обработке'")

    part = db.query(Part).filter(Part.id == data.part_id).first()
    if not part:
        raise HTTPException(404, "Product not found")

    # Цена — как её видит клиент заказа: для роли b2b с B2B-наценкой.
    # Общий резолвер best_offer выбирает оффер «в наличии, самый свежий».
    b2b_margin = b2b_margin_for_user(db, order.user_id)
    best = best_offer(part.offers or [], b2b_margin=b2b_margin)
    if not best or best.get("price") is None:
        raise HTTPException(400, "Для этого товара нет доступной цены")

    unit_price = float(best["price"])
    quantity = max(1, data.quantity)

    # Check if item already exists in the order
    existing_item = None
    for item in order.items:
        if item.part_id == data.part_id:
            existing_item = item
            break

    role_name = current_user.role.name if current_user.role else ""
    user_display = _actor_name(current_user)
    part_info = f"{part.name} {part.article} (SKU: {part.sku or '—'})"

    if existing_item:
        # Increment quantity
        old_qty = existing_item.quantity
        existing_item.quantity += quantity
        changes = [f"{part_info}: {old_qty} шт. → {existing_item.quantity} шт."]
    else:
        # Create new order item
        new_item = OrderItem(
            order_id=order.id,
            part_id=data.part_id,
            quantity=quantity,
            price=unit_price,
            supplier_offer_id=best.get("supplier_offer_id"),
        )
        db.add(new_item)
        db.flush()
        changes = [f"{part_info}: добавлено {quantity} шт. × {unit_price:.2f} ₴"]

    # Recalculate total - re-query items to ensure we have the latest
    db.flush()
    all_items = db.query(OrderItem).filter(
        OrderItem.order_id == order.id
    ).all()
    order.total = sum(
        float(i.quantity) * float(i.price) for i in all_items
    )

    order.updated_by_user_id = current_user.id
    order.updated_by_name = user_display
    order.updated_by_group = role_name
    order.updated_at = datetime.utcnow()

    log = OrderChangeLog(
        order_id=order.id,
        user_id=current_user.id,
        user_name=user_display,
        user_group=role_name,
        action="item_added",
        details="; ".join(changes),
    )
    db.add(log)
    db.commit()

    # Re-fetch to get the updated items list with part data
    db.refresh(order)
    # Reload items with part data
    items = db.query(OrderItem).options(
        joinedload(OrderItem.part)
    ).filter(OrderItem.order_id == order.id).all()

    return AdminOrderDetailResponse(
        id=order.id,
        order_number=order.order_number or f"ORD-{order.id:010d}",
        user_id=order.user_id,
        status=order.status.value if hasattr(order.status, "value") else order.status,
        total=float(order.total),
        full_name=order.full_name,
        phone=order.phone,
        address=order.address,
        last_name=order.last_name,
        first_name=order.first_name,
        middle_name=order.middle_name,
        delivery_type=order.delivery_type,
        delivery_city=order.delivery_city,
        delivery_warehouse=order.delivery_warehouse,
        delivery_city_ref=order.delivery_city_ref,
        delivery_settlement_ref=order.delivery_settlement_ref,
        delivery_city_label=order.delivery_city_label,
        delivery_warehouse_ref=order.delivery_warehouse_ref,
        delivery_warehouse_label=order.delivery_warehouse_label,
        delivery_street_ref=order.delivery_street_ref,
        delivery_street_label=order.delivery_street_label,
        delivery_house=order.delivery_house,
        delivery_apartment=order.delivery_apartment,
        promocode_code=order.promocode_code,
        discount_amount=float(order.discount_amount or 0),
        original_total=float(order.original_total or 0) if order.original_total else None,
        payment_method=order.payment_method,
        created_at=order.created_at,
        updated_by_name=order.updated_by_name,
        updated_by_group=order.updated_by_group,
        updated_at=order.updated_at,
        items=[
            AdminOrderItemSchema(
                id=i.id,
                part_id=i.part_id,
                article=i.part.article,
                part_name=i.part.name,
                brand=i.part.brand,
                quantity=i.quantity,
                price=float(i.price),
                sku=i.part.sku,
            )
            for i in items
        ],
    )


@router.put("/orders/{order_id}/status")
async def update_order_status(
    order_id: int,
    data: UpdateOrderStatusSchema,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("orders.edit_status")),
):
    """Изменить статус заказа. Создаёт запись в истории изменений."""
    order = db.query(Order).filter(Order.id == order_id).first()
    if not order:
        raise HTTPException(404, "Order not found")
    try:
        new_status = OrderStatus(data.status)
    except ValueError:
        raise HTTPException(400, f"Invalid status. Must be one of: {', '.join(s.value for s in OrderStatus)}")

    old_status = order.status.value if hasattr(order.status, "value") else order.status
    order.status = new_status

    # Track first time the order is marked as delivered
    if data.status == "delivered" and order.first_delivered_at is None:
        order.first_delivered_at = datetime.utcnow()

    role_name = current_user.role.name if current_user.role else ""
    order.updated_by_user_id = current_user.id
    order.updated_by_name = _actor_name(current_user)
    order.updated_by_group = role_name
    order.updated_at = datetime.utcnow()

    log = OrderChangeLog(
        order_id=order.id,
        user_id=current_user.id,
        user_name=_actor_name(current_user),
        user_group=role_name,
        action="status_change",
        details=f"статус: {old_status} → {data.status}",
    )
    db.add(log)
    db.commit()

    # Telegram notification about order status change (fire-and-forget)
    import asyncio
    asyncio.ensure_future(
        send_telegram_notification(
            telegram_format.order_status_changed(
                order_number=order.order_number,
                old_status=old_status,
                new_status=data.status,
                role=role_name,
                last_name=current_user.last_name,
                first_name=current_user.first_name,
            )
        )
    )
    # Notify customer via Telegram if linked
    asyncio.ensure_future(
        send_customer_telegram_notification(
            order.user_id,
            telegram_format.customer_order_status_changed(order.order_number, data.status),
        )
    )

    return {"message": "Status updated", "status": data.status}


@router.get("/orders/{order_id}/history", response_model=list[OrderChangeLogResponse])
async def get_order_history(
    order_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("orders.view")),
):
    """Получить историю изменений заказа."""
    order_obj = db.query(Order).filter(Order.id == order_id).first()
    if not order_obj:
        raise HTTPException(404, "Order not found")
    logs = db.query(OrderChangeLog).filter(
        OrderChangeLog.order_id == order_id
    ).order_by(OrderChangeLog.created_at.desc()).all()
    return logs


@router.get("/orders/{order_id}/all-events", response_model=list[UnifiedEventResponse])
async def get_order_all_events(
    order_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("orders.view")),
):
    """Получить объединённую историю заказа: изменения заказа + события ТТН."""
    order_obj = db.query(Order).filter(Order.id == order_id).first()
    if not order_obj:
        raise HTTPException(404, "Order not found")

    # 1) Order change logs
    order_logs = db.query(OrderChangeLog).filter(
        OrderChangeLog.order_id == order_id
    ).all()

    # 2) Waybill events (TTN)
    waybill_events = db.query(OrderNovaPoshtaWaybillEvent).filter(
        OrderNovaPoshtaWaybillEvent.order_id == order_id
    ).all()

    # Merge and sort by created_at desc
    merged: list[UnifiedEventResponse] = []

    for log in order_logs:
        merged.append(UnifiedEventResponse(
            id=log.id,
            type="order",
            event_type=log.action,
            user_name=log.user_name,
            user_group=log.user_group,
            details=log.details,
            created_at=log.created_at,
        ))

    for ev in waybill_events:
        actor_name = ""
        actor_group = ""
        np_number = None
        if ev.created_by:
            user = ev.created_by
            parts = [user.last_name or '', user.first_name or '']
            actor_name = ' '.join(filter(None, parts)).strip() or user.full_name or ''
            actor_group = user.role.name if user.role else ''
        # Extract TTN number from event message "TTN 20451471413254 створено"
        if ev.message:
            m = re.search(r'(\d{14})', ev.message)
            if m:
                np_number = m.group(1)
        merged.append(UnifiedEventResponse(
            id=ev.id,
            type="waybill",
            event_type=ev.event_type,
            user_name=actor_name or None,
            user_group=actor_group or None,
            details=ev.message,
            np_number=np_number or None,
            created_at=ev.created_at,
        ))

    merged.sort(key=lambda e: e.created_at, reverse=True)
    return merged
