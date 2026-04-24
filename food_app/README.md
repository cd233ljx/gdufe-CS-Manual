# 美食分享平台 (food_app)

## 项目简介

美食分享平台是一个基于 Flask 开发的 web 应用，用于收集、审核和发布校园周边的美食推荐。该平台允许用户提交美食信息，管理员审核后自动生成文档并更新到静态网站。

## 项目架构

### 技术栈

- **后端**：Flask
- **前端**：HTML5, CSS3, JavaScript
- **数据库**：SQLite
- **文档生成**：Markdown
- **静态网站**：MkDocs

### 项目结构

```
food_app/
├── templates/             # 前端模板
│   ├── index.html        # 首页
│   ├── submit.html       # 投稿页面
│   ├── review.html       # 审核页面
│   └── login.html        # 登录页面
├── uploads/              # 上传文件目录
├── app.py                # 主应用文件
├── food_review.db        # SQLite 数据库
├── requirements.txt      # 依赖文件
└── README.md             # 项目说明
```

### 核心模块

1. **数据模型**：使用 SQLite 数据库存储用户和投稿信息
2. **审核队列**：基于双向链表实现的投稿审核队列
3. **文档生成**：自动将审核通过的投稿生成 Markdown 文档
4. **静态网站更新**：自动更新静态网站的相关文件

## 功能说明

### 1. 首页

- 展示平台介绍和轮播图
- 提供「我要投稿」和「管理员登录」入口
- 集成 Giscus 评论系统，支持用户交流

### 2. 投稿功能

用户可以提交美食推荐，包括以下信息：
- 店铺名称
- 推荐理由
- 校区（三水校区/广州校区）
- 美食类别（地方菜系、异域料理、快餐小吃、甜品饮品）
- 推荐星数（1-5星）
- 人均消费（选填）
- 店铺链接（选填）
- 店铺地址
- 图片上传
- 提交人昵称（选填）
- 联系方式（选填）

### 3. 审核管理

管理员可以：
- 查看待审核的投稿列表
- 审核通过或拒绝投稿
- 为通过的投稿添加经纬度信息
- 审核通过后自动生成文档并更新静态网站

### 4. 文档生成

审核通过后，系统会：
- 生成对应的 Markdown 文档
- 更新校区的 out.md 文件，添加新的美食链接
- 更新 shops.json 文件，添加店铺信息（如果提供了坐标）
- 重建 MkDocs 静态网站

## 安装与部署

### 环境要求

- Python 3.6+
- Flask
- SQLite

### 安装步骤

1. **克隆项目**

```bash
git clone https://github.com/yourusername/food_app.git
cd food_app
```

2. **安装依赖**

```bash
pip install -r requirements.txt
```

3. **启动应用**

```bash
python app.py
```

应用默认运行在 `http://localhost:5000`

## 使用方法

### 普通用户

1. 访问首页，点击「我要投稿」
2. 填写美食信息并提交
3. 等待管理员审核

### 管理员

1. 访问首页，点击「管理员登录」
2. 使用默认账号登录（用户名：admin，密码：admin123）
3. 在审核页面查看待审核的投稿
4. 点击「通过」或「拒绝」处理投稿
5. 对于通过的投稿，可以添加经纬度信息

## API 文档

### 路由说明

| 路由 | 方法 | 功能 | 权限 |
|------|------|------|------|
| `/` | GET | 首页 | 公开 |
| `/submit` | GET/POST | 投稿页面 | 公开 |
| `/login` | GET/POST | 登录页面 | 公开 |
| `/logout` | GET | 退出登录 | 管理员 |
| `/review` | GET | 审核页面 | 管理员 |
| `/review/<int:submission_id>/approve` | POST | 审核通过 | 管理员 |
| `/review/<int:submission_id>/reject` | POST | 审核拒绝 | 管理员 |
| `/uploads/<path:filename>` | GET | 访问上传文件 | 公开 |

### 核心函数

#### 1. 数据结构

##### `DoublyLinkedListNode` 类
- **功能**：双向链表节点
- **属性**：
  - `data`：节点数据
  - `prev`：前一个节点
  - `next`：后一个节点

##### `ReviewQueue` 类
- **功能**：基于双向链表的审核队列
- **方法**：
  - `enqueue(data)`：入队
  - `dequeue()`：出队
  - `sort_by_time()`：按时间排序
  - `get_all()`：获取所有元素
  - `is_empty()`：检查队列是否为空

#### 2. 数据库操作

##### `init_db()`
- **功能**：初始化数据库，创建用户表和投稿表
- **参数**：无
- **返回值**：无

#### 3. 工具函数

##### `clean_filename(filename)`
- **功能**：清理文件名，移除非法字符
- **参数**：
  - `filename`：原始文件名
- **返回值**：清理后的文件名

##### `generate_markdown(submission, campus)`
- **功能**：生成 Markdown 文档
- **参数**：
  - `submission`：投稿数据
  - `campus`：校区
- **返回值**：生成的 Markdown 文件路径

##### `update_out_md(campus, category, title)`
- **功能**：更新校区的 out.md 文件
- **参数**：
  - `campus`：校区
  - `category`：美食类别
  - `title`：店铺名称
- **返回值**：无

##### `update_shops_json(campus, title, description, category, position)`
- **功能**：更新 shops.json 文件
- **参数**：
  - `campus`：校区
  - `title`：店铺名称
  - `description`：推荐理由
  - `category`：美食类别
  - `position`：坐标
- **返回值**：无

##### `rebuild_mkdocs()`
- **功能**：重建 MkDocs 静态网站
- **参数**：无
- **返回值**：无

#### 4. 路由函数

##### `index()`
- **功能**：渲染首页
- **参数**：无
- **返回值**：首页 HTML

##### `submit()`
- **功能**：处理投稿
- **参数**：无
- **返回值**：投稿页面 HTML 或重定向

##### `login()`
- **功能**：处理登录
- **参数**：无
- **返回值**：登录页面 HTML 或重定向

##### `logout()`
- **功能**：处理退出登录
- **参数**：无
- **返回值**：重定向到登录页面

##### `review()`
- **功能**：渲染审核页面
- **参数**：无
- **返回值**：审核页面 HTML

##### `approve(submission_id)`
- **功能**：审核通过投稿
- **参数**：
  - `submission_id`：投稿 ID
- **返回值**：重定向到审核页面

##### `reject(submission_id)`
- **功能**：审核拒绝投稿
- **参数**：
  - `submission_id`：投稿 ID
- **返回值**：重定向到审核页面

## 数据库结构

### users 表

| 字段名 | 类型 | 说明 |
|--------|------|------|
| id | INTEGER | 自增主键 |
| username | TEXT | 用户名 |
| password | TEXT | 密码 |
| role | TEXT | 角色（默认 'user'） |

### food_submissions 表

| 字段名 | 类型 | 说明 |
|--------|------|------|
| id | INTEGER | 自增主键 |
| title | TEXT | 店铺名称 |
| description | TEXT | 推荐理由 |
| category | TEXT | 美食类别 |
| campus | TEXT | 校区 |
| stars | INTEGER | 推荐星数（默认 4） |
| price | TEXT | 人均消费 |
| shop_link | TEXT | 店铺链接 |
| shop_address | TEXT | 店铺地址 |
| image_path | TEXT | 图片路径 |
| status | TEXT | 状态（默认 'pending'） |
| submit_time | DATETIME | 提交时间（默认当前时间） |
| submitter | TEXT | 提交人 |
| contact | TEXT | 联系方式 |


