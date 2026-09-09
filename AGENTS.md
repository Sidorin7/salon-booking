<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Сервис записи в салон

## Прежде чем что-либо делать

Прочитай `PROGRESS.md` в корне. Там состояние проекта, принятые решения
с обоснованием и список граблей, на которые уже наступали. Проект делается
за несколько заходов — без этого файла ты повторишь чужие ошибки.

**В конце каждого сеанса обнови `PROGRESS.md`:** статус этапов, новые
решения, новые грабли, что дальше.

## Правила, которые здесь важнее общих

- Дизайн-токены живут только в `src/app/globals.css`. Хардкод цвета
  или кегля в компоненте — ошибка ревью.
- `src/domain/` не импортирует ни Prisma, ни Next. Только чистые функции.
- Server Action не содержит бизнес-логики: сессия и роль, валидация,
  вызов сервиса, `revalidatePath`.
- Новый код пишется по TDD: сначала падающий тест, потом реализация.
- Prisma закреплена на 7.10.0 намеренно. Тег `latest` указывает на
  release candidate — не обновлять не разобравшись.
- Ручные `EXCLUDE` и `CHECK` в первой миграции при её пересоздании
  переносить руками.
