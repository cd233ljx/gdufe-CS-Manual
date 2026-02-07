import requests
import json

# 测试提交投稿
print("测试提交投稿...")
data = {
    "name": "测试店铺",
    "description": "这是一个测试店铺",
    "average_price": "20元",
    "link": "https://example.com",
    "campus": "广州校区"
}

response = requests.post('http://localhost:5000/submit-food', json=data)
print("提交响应:")
print("状态码:", response.status_code)
print("响应内容:", response.text)
print()

# 测试获取投稿
print("测试获取投稿...")
response = requests.get('http://localhost:5000/admin/submissions')
print("获取响应:")
print("状态码:", response.status_code)
print("响应内容:", response.text)
print()

# 测试三水校区投稿
print("测试三水校区投稿...")
data_ss = {
    "name": "三水测试店铺",
    "description": "三水校区测试",
    "average_price": "15元",
    "link": "https://example.com",
    "campus": "三水校区"
}

response = requests.post('http://localhost:5000/submit-food', json=data_ss)
print("提交响应:")
print("状态码:", response.status_code)
print("响应内容:", response.text)
print()

# 再次获取所有投稿
print("再次获取所有投稿...")
response = requests.get('http://localhost:5000/admin/submissions')
print("获取响应:")
print("状态码:", response.status_code)
print("响应内容:", response.text)
