# Multiavatar Configuration

## Настройка аватаров

Проект полностью настроен на использование multiavatar.com API вместо DiceBear.

### Как это работает

1. **getAvatarUrl()** - Функция генерирует уникальный аватар на основе:
   - `avatarIndex` - ID аватара пользователя (сохраняется в БД)
   - `seed` - имя или email пользователя (для предсказуемости)

2. **Пример URL:**
   ```
   https://api.multiavatar.com/${encodeURIComponent(seed)}.png
   ```

3. **Приоритеты:**
   - Если передан `seed` (имя/почта) - использует его
   - Иначе использует `user${avatarIndex}`

### Где используется

- **Header** - в выпадающем меню пользователя
- **Profile** - в карточке профиля и селекторе аватаров
- **Admin Panel** - в боковой панели администратора

### Изменения

✅ Удалена ссылка на DiceBear  
✅ Используется только multiavatar.com API  
✅ Все компоненты обновлены для передачи seed (имя/email)  
✅ URL формат: `https://api.multiavatar.com/{seed}.png`  

### Тестирование

Откройте в браузере: `file:///tmp/test_multiavatar.html`

Или попробуйте в браузере:
```
https://api.multiavatar.com/testuser.png
https://api.multiavatar.com/user1.png
https://api.multiavatar.com/user12345.png
```

### Пакеты

Пакет `@multiavatar/multiavatar` больше не используется (оставлен для совместимости с зависимостями).
