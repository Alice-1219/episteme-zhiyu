# Episteme 知屿 — Dynamic V3

## 这版新增

### 录课
录课页面分为三个长期栏目：
1. **01 · 课本内容** — 概念、定义、公式、知识逻辑
2. **02 · IG 题目讲解** — IGCSE/IG 题目拆解、思路、常见错误
3. **03 · 专题与进阶** — 课本之外的专题、拓展与知识连接

课程在 Supabase `courses.course_type` 中使用：
- `textbook`
- `ig`
- `advanced`

### 资源库
- 所有已登录成员都可以上传资料
- 上传后状态为 `pending`
- 学科负责人 / admin 审核
- `approved` 的资料公开显示
- 可以按类型、关键词筛选
- 学科负责人可进入 `#/admin/resources` 查看和审核资料

## 数据库迁移
如果你已经运行过原来的 `supabase/schema.sql`，**不要重新跑整个 schema**。

只需要在 Supabase SQL Editor 运行一次：

`supabase/migration_v3.sql`

如果这是一个全新的 Supabase 项目，则先运行原来的 `supabase/schema.sql`，再运行 `migration_v3.sql`。

## 学科负责人权限
在 Supabase SQL Editor 中，把对应用户的 `profiles.role` 改成：

```sql
update public.profiles
set role='subject_manager'
where id='这里填用户的UUID';
```

管理员使用：

```sql
update public.profiles
set role='admin'
where id='这里填用户的UUID';
```

## 本地运行

```bash
cd ~/Downloads/Episteme-Zhiyu-Dynamic-V2
python3 -m http.server 8000
```

然后打开 `http://localhost:8000`。

## 重要
不要把 `config.js` 里的 Supabase Secret / service_role key 放进前端。前端只使用 Project URL + Publishable Key。
