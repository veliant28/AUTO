## План: Карта для возврата денег (Bank Card)

### 1. База данных — модель + миграция
Добавить колонку `bank_card` (String 19, nullable) в `return_requests`.

### 2. Схемы (`returns_schemas.py`)
- `ReturnRequestSchema` — добавить `bank_card: Optional[str]`
- `ReturnCreate` — добавить `bank_card: str` (обязательное)
- `AdminReturnDetailResponse` — добавить `bank_card: Optional[str]`
- `AdminReturnUpdateSchema` — добавить `bank_card: Optional[str]`
- `ReturnCardUpdate` — новая схема: `bank_card: str`

### 3. API endpoints

**Storefront (`returns.py`):**
- `POST /returns/from-order/{id}` — валидировать `bank_card`
- `PUT /returns/{id}/card` — сохранить карту (только PENDING), логировать в `ReturnChangeLog`

**Admin (`admin/returns.py`):**
- `PUT /admin/returns/{id}` — принимать `bank_card`, логировать

### 4. Фронтенд — `/returns/[id]/page.tsx` (витрина)
InputOTP на 16 цифр (4×4 с разделителями) справа от суммы возврата:
- Ввод: InputOTP с `maxLength={16}`
- Маска: `**** **** **** 1234` (первые и последние 4 видны)
- Кнопка "Сохранить"/"Изменить" (как у ТТН)
- Редактирование только PENDING

### 5. Фронтенд — `/orders/[id]/return/page.tsx` (создание)
InputOTP обязательное поле, без 16 цифр кнопка не активна.

### 6. Фронтенд — `/admin/returns/page.tsx` (админка)
В модалке, 2-я колонка, блок "Заказ", под суммой возврата:
- Поле карты с InputOTP в режиме редактирования
- Маска в режиме просмотра
- Сохраняется через кнопки модалки "Редактировать"/"Сохранить"

### 7. История
- `card_update` в `ReturnChangeLog` с маскированным номером
- Показывать в таймлайне (фиолетовая точка, иконка CreditCard)

### 8. Переводы (ru/en/ua)
- `return_card_label`, `return_card_placeholder`, `return_card_saved`, `return_card_required`, `return_card_save`, `return_card_edit`, `return_card_updated`, `card_update`

### 9. Status-locked
- Редактирование только при статусе PENDING
- При смене статуса с PENDING на другой — блокируется
- При возврате в PENDING — разблокируется
