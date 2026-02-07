from flask import Flask, request, jsonify
from flask_cors import CORS
from sqlalchemy import create_engine, Column, String, Integer, Float, Text
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
import json

# 创建 Flask 应用
app = Flask(__name__)
app.config['JSON_AS_ASCII'] = False  # 确保JSON响应使用UTF-8编码
CORS(app)  # 允许跨域请求

# 配置数据库 - 确保使用UTF-8编码
Base = declarative_base()
engine = create_engine('sqlite:///food_submissions.db', echo=True, connect_args={'check_same_thread': False})
Session = sessionmaker(bind=engine)

# 使用线程本地存储来确保每个请求都有独立的会话
from flask import g

def get_db():
    if 'db' not in g:
        g.db = Session()
    return g.db

@app.teardown_appcontext
def close_db(e=None):
    db = g.pop('db', None)
    if db is not None:
        db.close()

# 定义投稿模型
class FoodSubmission(Base):
    __tablename__ = 'food_submissions'
    
    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String, nullable=False)
    description = Column(Text, nullable=False)
    average_price = Column(String, nullable=False)
    link = Column(String, nullable=False)
    campus = Column(String, nullable=False)
    status = Column(String, default='pending')  # pending, approved, rejected

# 创建数据库表
Base.metadata.create_all(engine)

# 投稿接口
@app.route('/submit-food', methods=['POST'])
def submit_food():
    try:
        data = request.json
        print('收到投稿数据:', data)
        
        # 创建投稿记录
        submission = FoodSubmission(
            name=data['name'],
            description=data['description'],
            average_price=data['average_price'],
            link=data['link'],
            campus=data['campus']
        )
        
        # 保存到数据库
        db = get_db()
        db.add(submission)
        db.commit()
        
        return jsonify({'success': True, 'message': '投稿成功！我们会尽快审核并添加到地图中。'})
    except Exception as e:
        print('投稿处理失败:', str(e))
        return jsonify({'success': False, 'message': '投稿处理失败，请稍后重试。'})

# 获取所有投稿（后台审核用）
@app.route('/admin/submissions', methods=['GET'])
def get_submissions():
    try:
        db = get_db()
        submissions = db.query(FoodSubmission).all()
        result = []
        for sub in submissions:
            result.append({
                'id': sub.id,
                'name': sub.name,
                'description': sub.description,
                'average_price': sub.average_price,
                'link': sub.link,
                'campus': sub.campus,
                'status': sub.status
            })
        return jsonify(result)
    except Exception as e:
        print('获取投稿失败:', str(e))
        return jsonify({'success': False, 'message': '获取投稿失败。'})

# 审核投稿
@app.route('/admin/approve/<submission_id>', methods=['POST'])
def approve_submission(submission_id):
    try:
        db = get_db()
        submission = db.query(FoodSubmission).filter_by(id=submission_id).first()
        if submission:
            submission.status = 'approved'
            db.commit()
            
            # 这里可以添加自动更新地图的逻辑
            # 目前我们手动更新地图文件
            
            return jsonify({'success': True, 'message': '审核通过！请手动更新地图文件。'})
        else:
            return jsonify({'success': False, 'message': '投稿不存在。'})
    except Exception as e:
        print('审核失败:', str(e))
        return jsonify({'success': False, 'message': '审核失败，请稍后重试。'})

# 拒绝投稿
@app.route('/admin/reject/<submission_id>', methods=['POST'])
def reject_submission(submission_id):
    try:
        db = get_db()
        submission = db.query(FoodSubmission).filter_by(id=submission_id).first()
        if submission:
            submission.status = 'rejected'
            db.commit()
            return jsonify({'success': True, 'message': '已拒绝该投稿。'})
        else:
            return jsonify({'success': False, 'message': '投稿不存在。'})
    except Exception as e:
        print('拒绝失败:', str(e))
        return jsonify({'success': False, 'message': '拒绝失败，请稍后重试。'})

# 后台管理页面
@app.route('/admin', methods=['GET'])
def admin_page():
    return open('admin.html', 'r', encoding='utf-8').read()

if __name__ == '__main__':
    app.run(debug=True, port=5000)
