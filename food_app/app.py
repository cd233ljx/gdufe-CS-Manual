from flask import Flask, render_template, request, redirect, url_for, flash, session
import os
import subprocess
import re
import sqlite3
import json
from datetime import datetime

app = Flask(__name__)
app.secret_key = 'your-secret-key'

# 配置
UPLOAD_FOLDER = os.path.join(os.path.dirname(__file__), 'uploads')
app.config['UPLOAD_FOLDER'] = UPLOAD_FOLDER
app.config['MAX_CONTENT_LENGTH'] = 16 * 1024 * 1024  # 16MB

# 创建上传目录
if not os.path.exists(UPLOAD_FOLDER):
    os.makedirs(UPLOAD_FOLDER)

# 双向链表节点类
class DoublyLinkedListNode:
    def __init__(self, data):
        self.data = data
        self.prev = None
        self.next = None

# 基于双向链表的审核队列类
class ReviewQueue:
    def __init__(self):
        self.head = None
        self.tail = None
        self.size = 0
    
    def enqueue(self, data):
        new_node = DoublyLinkedListNode(data)
        if self.tail is None:
            self.head = new_node
            self.tail = new_node
        else:
            self.tail.next = new_node
            new_node.prev = self.tail
            self.tail = new_node
        self.size += 1
    
    def dequeue(self):
        if self.head is None:
            return None
        data = self.head.data
        if self.head == self.tail:
            self.head = None
            self.tail = None
        else:
            self.head = self.head.next
            self.head.prev = None
        self.size -= 1
        return data
    
    def sort_by_time(self):
        if self.size <= 1:
            return
        
        current = self.head.next
        while current:
            next_node = current.next
            temp = current
            while temp.prev and temp.prev.data['submit_time'] < temp.data['submit_time']:
                temp.data, temp.prev.data = temp.prev.data, temp.data
                temp = temp.prev
            current = next_node
    
    def get_all(self):
        result = []
        current = self.head
        while current:
            result.append(current.data)
            current = current.next
        return result
    
    def is_empty(self):
        return self.size == 0

# 数据库连接
db_path = os.path.join(os.path.dirname(__file__), 'food_review.db')
db = sqlite3.connect(db_path, check_same_thread=False)
db.row_factory = sqlite3.Row

# 初始化数据库
def init_db():
    with db:
        # 创建用户表
        db.execute('''
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE NOT NULL,
            password TEXT NOT NULL,
            role TEXT DEFAULT 'user'
        )''')
        
        # 创建投稿表
        db.execute('''
        CREATE TABLE IF NOT EXISTS food_submissions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT NOT NULL,
            description TEXT NOT NULL,
            category TEXT NOT NULL,
            campus TEXT NOT NULL,
            stars INTEGER DEFAULT 4,
            image_path TEXT,
            status TEXT DEFAULT 'pending',
            submit_time DATETIME DEFAULT CURRENT_TIMESTAMP,
            submitter TEXT,
            contact TEXT
        )''')
        
        # 检查表结构是否需要升级
        cursor = db.execute("PRAGMA table_info(food_submissions)")
        columns = [col[1] for col in cursor.fetchall()]
        
        # 添加campus字段（如果不存在）
        if 'campus' not in columns:
            db.execute("ALTER TABLE food_submissions ADD COLUMN campus TEXT DEFAULT 'sanshui'")
        
        # 添加stars字段（如果不存在）
        if 'stars' not in columns:
            db.execute("ALTER TABLE food_submissions ADD COLUMN stars INTEGER DEFAULT 4")
        
        # 检查是否存在管理员用户
        cursor = db.execute('SELECT * FROM users WHERE username = ?', ('admin',))
        if not cursor.fetchone():
            db.execute('INSERT INTO users (username, password, role) VALUES (?, ?, ?)', 
                         ('admin', 'admin123', 'admin'))

# 清理文件名
def clean_filename(filename):
    illegal_chars = r'[<>:"/\\|?*\x00-\x1f]'
    cleaned = re.sub(illegal_chars, '', filename)
    cleaned = cleaned.replace(' ', '_')
    return cleaned

# 生成Markdown文件
def generate_markdown(submission, campus):
    base_dir = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'docs', 'life', 'food', campus, 'out')
    category_dir = os.path.join(base_dir, submission['category'])
    
    if not os.path.exists(category_dir):
        os.makedirs(category_dir)
    
    safe_title = clean_filename(submission['title'])
    md_filename = f"{safe_title}.md"
    md_path = os.path.join(category_dir, md_filename)
    
    # 构建Markdown内容
    md_content = f""" **{submission['title']}**

"""
    
    # 添加推荐程度（使用投稿人选择的星数）
    stars = "⭐" * submission['stars']
    md_content += f"- **⭐推荐程度** {stars}\n\n"
    
    # 添加人均消费（未填写）
    md_content += f"- **💰人均消费**: 未填写\n\n"
    
    # 添加店铺链接（未填写）
    md_content += f"- **🔗店铺链接**: 未填写\n\n"
    
    # 添加店铺地址（未填写）
    md_content += f"""
- **🗺️店铺地址**: 未填写



#### 🥣评价：
{submission['description']}

图片：

"""
    
    # 添加推荐人（如果有值）
    if submission['submitter']:
        md_content += f"- 👤推荐人：{submission['submitter']}\n"
    
    # 添加提交时间
    md_content += f"""
- 🕙提交时间: {submission['submit_time']}

---
{{
    name: '{submission['title']}',
    position: [],
    description: '{submission['description']}',
    link: 'out/{submission['category']}/{submission['title']}'
}}
"""
    
    with open(md_path, 'w', encoding='utf-8') as f:
        f.write(md_content)
    
    return md_path

# 更新校区out.md文件
def update_out_md(campus, category, title):
    out_md_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'docs', 'life', 'food', campus, 'out', f'{campus}_out.md')
    
    with open(out_md_path, 'r', encoding='utf-8') as f:
        content = f.read()
    
    category_pattern = f"## {category}"
    if category_pattern not in content:
        content += f"\n## {category}\n\n"
    
    link_pattern = f"[{title}]({category}/{clean_filename(title)}.md)"
    if link_pattern not in content:
        lines = content.split('\n')
        new_lines = []
        for i, line in enumerate(lines):
            new_lines.append(line)
            if line.strip() == f"## {category}":
                j = i + 1
                while j < len(lines) and lines[j].strip() == '':
                    j += 1
                new_lines.insert(j, f"- [{title}]({category}/{clean_filename(title)}.md) ")
        
        with open(out_md_path, 'w', encoding='utf-8') as f:
            f.write('\n'.join(new_lines))

# 更新shops.json文件
def update_shops_json(campus, title, description, category, position):
    shops_json_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'docs', 'life', 'food', campus, 'shops.json')
    
    with open(shops_json_path, 'r', encoding='utf-8') as f:
        shops = json.load(f)
    
    # 检查是否已存在同名店铺
    existing = next((shop for shop in shops if shop['name'] == title), None)
    if not existing:
        new_shop = {
            'name': title,
            'position': position,
            'description': description,
            'link': f'out/{category}/{title}'
        }
        shops.append(new_shop)
        
        with open(shops_json_path, 'w', encoding='utf-8') as f:
            json.dump(shops, f, ensure_ascii=False, indent=4)

# 重建MkDocs
def rebuild_mkdocs():
    mkdocs_dir = os.path.dirname(os.path.dirname(__file__))
    subprocess.run(['python', '-m', 'mkdocs', 'build'], cwd=mkdocs_dir)

# 首页
@app.route('/')
def index():
    return render_template('index.html')

# 投稿页面
@app.route('/submit', methods=['GET', 'POST'])
def submit():
    if request.method == 'POST':
        title = request.form['title']
        description = request.form['description']
        category = request.form['category']
        campus = request.form['campus']
        stars = int(request.form['stars'])
        submitter = request.form['submitter']
        contact = request.form['contact']
        
        if not title or not description or not category or not campus:
            flash('请填写必填字段')
            return redirect(url_for('submit'))
        
        image_path = None
        if 'image' in request.files:
            file = request.files['image']
            if file and file.filename:
                filename = clean_filename(file.filename)
                filepath = os.path.join(app.config['UPLOAD_FOLDER'], filename)
                file.save(filepath)
                image_path = filename
        
        with db:
            db.execute('''
            INSERT INTO food_submissions (title, description, category, campus, stars, image_path, submitter, contact)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            ''', (title, description, category, campus, stars, image_path, submitter, contact))
        
        flash('投稿成功，等待审核')
        return redirect(url_for('submit'))
    
    return render_template('submit.html')

# 登录页面
@app.route('/login', methods=['GET', 'POST'])
def login():
    if request.method == 'POST':
        username = request.form['username']
        password = request.form['password']
        
        cursor = db.execute('SELECT * FROM users WHERE username = ? AND password = ?', (username, password))
        user = cursor.fetchone()
        
        if user:
            session['user_id'] = user['id']
            session['username'] = user['username']
            session['role'] = user['role']
            return redirect(url_for('review'))
        else:
            flash('登录失败，请检查用户名和密码')
    
    return render_template('login.html')

# 退出登录
@app.route('/logout')
def logout():
    session.clear()
    return redirect(url_for('login'))

# 审核页面
@app.route('/review')
def review():
    cursor = db.execute('SELECT * FROM food_submissions WHERE status = ?', ('pending',))
    submissions = cursor.fetchall()
    
    # 创建审核队列
    review_queue = ReviewQueue()
    
    # 将投稿数据转换为字典并添加到队列
    for submission in submissions:
        submission_dict = dict(submission)
        review_queue.enqueue(submission_dict)
    
    # 按时间降序排序队列
    review_queue.sort_by_time()
    
    # 获取排序后的所有投稿
    sorted_submissions = review_queue.get_all()
    
    return render_template('review.html', submissions=sorted_submissions)

# 审核通过
@app.route('/review/<int:submission_id>/approve', methods=['POST'])
def approve(submission_id):
    cursor = db.execute('SELECT * FROM food_submissions WHERE id = ?', (submission_id,))
    submission = cursor.fetchone()
    
    if submission:
        # 获取坐标信息
        longitude = request.form.get('longitude', '')
        latitude = request.form.get('latitude', '')
        position = []
        if longitude and latitude:
            try:
                position = [float(longitude), float(latitude)]
            except ValueError:
                position = []
        
        # 更新状态
        with db:
            db.execute('UPDATE food_submissions SET status = ? WHERE id = ?', ('approved', submission_id))
            
            campus = submission['campus']
            
            # 生成Markdown文件
            generate_markdown(submission, campus)
            
            # 更新校区out.md
            update_out_md(campus, submission['category'], submission['title'])
            
            # 更新shops.json（如果有坐标）
            if position:
                update_shops_json(campus, submission['title'], submission['description'], submission['category'], position)
            
            # 重建MkDocs
            rebuild_mkdocs()
            
            flash('审核通过，已自动发布')
    
    return redirect(url_for('review'))

# 审核拒绝
@app.route('/review/<int:submission_id>/reject', methods=['POST'])
def reject(submission_id):
    with db:
        db.execute('UPDATE food_submissions SET status = ? WHERE id = ?', ('rejected', submission_id))
    
    flash('审核拒绝')
    return redirect(url_for('review'))

if __name__ == '__main__':
    init_db()
    app.run(debug=True, host='0.0.0.0', port=5000)