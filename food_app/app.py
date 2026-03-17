from flask import Flask, render_template, request, redirect, url_for, flash, session
import os
import subprocess
import re
import sqlite3
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
            image_path TEXT,
            status TEXT DEFAULT 'pending',
            submit_time DATETIME DEFAULT CURRENT_TIMESTAMP,
            submitter TEXT,
            contact TEXT
        )''')
        
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
def generate_markdown(submission):
    base_dir = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'docs', 'life', 'food', 'sanshui', 'out')
    category_dir = os.path.join(base_dir, submission['category'])
    
    if not os.path.exists(category_dir):
        os.makedirs(category_dir)
    
    safe_title = clean_filename(submission['title'])
    md_filename = f"{safe_title}.md"
    md_path = os.path.join(category_dir, md_filename)
    
    # 构建Markdown内容
    md_content = f""" **{submission['title']}**

"""
    
    # 添加推荐程度（固定为4星）
    stars = "⭐" * 4
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

# 更新sanshui_out.md
def update_sanshui_out(category, title):
    sanshui_out_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'docs', 'life', 'food', 'sanshui', 'out', 'sanshui_out.md')
    
    with open(sanshui_out_path, 'r', encoding='utf-8') as f:
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
        
        with open(sanshui_out_path, 'w', encoding='utf-8') as f:
            f.write('\n'.join(new_lines))

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
        submitter = request.form['submitter']
        contact = request.form['contact']
        
        if not title or not description or not category:
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
            INSERT INTO food_submissions (title, description, category, image_path, submitter, contact)
            VALUES (?, ?, ?, ?, ?, ?)
            ''', (title, description, category, image_path, submitter, contact))
        
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
            # 简单的会话管理
            session = {'user_id': user['id'], 'username': user['username'], 'role': user['role']}
            return redirect(url_for('review'))
        else:
            flash('登录失败，请检查用户名和密码')
    
    return render_template('login.html')

# 审核页面
@app.route('/review')
def review():
    cursor = db.execute('SELECT * FROM food_submissions WHERE status = ? ORDER BY submit_time DESC', ('pending',))
    submissions = cursor.fetchall()
    
    return render_template('review.html', submissions=submissions)

# 审核通过
@app.route('/review/<int:submission_id>/approve', methods=['POST'])
def approve(submission_id):
    cursor = db.execute('SELECT * FROM food_submissions WHERE id = ?', (submission_id,))
    submission = cursor.fetchone()
    
    if submission:
        # 更新状态
        with db:
            db.execute('UPDATE food_submissions SET status = ? WHERE id = ?', ('approved', submission_id))
            
            # 生成Markdown文件
            generate_markdown(submission)
            
            # 更新sanshui_out.md
            update_sanshui_out(submission['category'], submission['title'])
            
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