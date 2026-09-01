# Episteme 知屿 — Dynamic V2

这套版本是 **GitHub Pages + Supabase** 的动态网站。

## 你需要做的事情只有 4 步

### 1. 创建 Supabase 项目

注册 / 登录 Supabase，创建一个 Free project。

### 2. 建数据库

打开：

`Supabase Dashboard → SQL Editor → New query`

把：

`supabase/schema.sql`

全部复制进去并运行。

它会创建：

- profiles
- subjects
- questions
- answers
- courses
- course_lessons
- resources
- knowledge_base
- messages
- RLS 权限
- Realtime
- Storage bucket
- 注册用户自动创建 profile

### 3. 填两个配置

打开：

`config.js`

填：

```js
window.EPISTEME_CONFIG = {
  SUPABASE_URL: "https://你的项目.supabase.co",
  SUPABASE_PUBLISHABLE_KEY: "你的 publishable key"
};
```

只允许使用 Publishable key。

**不要把 service_role key、secret key、数据库密码放进 config.js。**

### 4. 上传 GitHub Pages

把整个文件夹上传到 GitHub repository：

```text
index.html
styles.css
app.js
config.js
404.html
.nojekyll
README.md
assets/logo.png
supabase/schema.sql
```

GitHub:

`Settings → Pages → Deploy from a branch → main → /root`

完成后就是：

`https://你的用户名.github.io/仓库名/`

---

# 已经动态化的功能

## 账号

- 注册
- 登录
- 退出
- profile
- student / subject_manager / admin

## Community

- Question Card
- 创建问题
- 学科
- Topic
- 状态
- 回答
- 实时数据库同步
- General Chat 实时消息

## Courses

- 数据库课程
- 数据库章节
- 视频 URL
- 课程详情
- HTML5 video player

## Library

- 数据库资源
- Storage 文件上传
- 审核状态
- 资源打开 / 下载
- 学科分类
- 搜索

## 权限

RLS 已经写进 SQL。

普通学生：
- 看公开问题
- 发问题
- 回答
- 参与聊天
- 上传自己的资源

学科负责人：
- 管理课程
- 管理章节
- 审核资源
- 管理 Knowledge Base
- 修改问题状态

管理员：
- 以上全部权限

---

# 设置第一个管理员

创建第一个账号后，在 Supabase SQL Editor 运行：

```sql
update public.profiles
set role='admin'
where id=(select id from auth.users order by created_at asc limit 1);
```

以后可以在 Supabase 的 profiles 表里给其他人设置：

```text
student
subject_manager
admin
```

---

# 课程怎么添加？

目前课程数据设计成：

```text
courses
  ↓
course_lessons
  ↓
video_url
```

例如：

```text
IGCSE 0606 Trigonometry
    ├── 01 Core Concepts
    ├── 02 Trigonometric Ratios
    ├── 03 Typical Questions
    └── 04 Common Mistakes
```

视频可以先放在一个公开可访问的视频地址，然后把 URL 写进 `course_lessons.video_url`。

**不要把大量视频直接放进 GitHub repository。**

---

# 资源怎么上传？

学科负责人 / 管理员可以在资源库看到：

`＋ 上传资源`

文件进入：

`Supabase Storage → episteme-resources`

数据库保存 metadata。

资源默认：

`pending`

审核后：

`approved`

只有 approved 资源对普通访客公开。

---

# AI 怎么接？

V2 已经把数据库结构留好了。

推荐后续：

```text
Question
   ↓
AI
   ├── Subject
   ├── Topic
   ├── Summary
   └── Duplicate detection
   ↓
Subject Manager
   ↓
Discuss
   ↓
Answer
   ↓
Verified
   ↓
Knowledge Base
```

不要把 AI secret/API key 放进 GitHub 前端。

AI 应该通过 Supabase Edge Function 或其他安全的 server-side function 调用。

---

# 关于免费

第一阶段可以使用：

GitHub Pages Free
+
Supabase Free

但“免费”都有额度，不是无限量。

最容易占用额度的是：

- 大量视频
- 大量文件
- 大量图片
- 大量实时消息
- 大量 AI API 请求

所以建议：

- GitHub：只放代码
- Supabase Storage：放小型学习资料
- 视频：先用外部视频托管
- AI：先处理 Question Card，不要让 AI 对所有聊天消息逐条调用

---

# 现在已经不能说“假的动态”

只要完成 config.js + schema.sql：

```text
学生 A
  ↓
GitHub Pages
  ↓
Supabase
  ↓
questions
  ↓
学生 B
  ↓
看到同一个 Question Card
```

实时聊天：

```text
A 发送消息
  ↓
Supabase Realtime
  ↓
B / C / D 浏览器
  ↓
立即出现
```

这才是真正的多人网站。

---

# 安全注意

前端可以出现：

- Supabase Project URL
- Supabase Publishable Key

前端绝对不要出现：

- service_role key
- secret key
- database password
- AI provider secret key

RLS 是必须开启的。本项目 SQL 已经开启。
