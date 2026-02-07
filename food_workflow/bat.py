import pandas as pd
import os
import re


def clean_filename(filename):
    """清理文件名，移除非法字符"""
    # 移除Windows文件名中的非法字符
    illegal_chars = r'[<>:"/\\|?*\x00-\x1f]'
    cleaned = re.sub(illegal_chars, '', filename)
    # 替换空格为下划线
    cleaned = cleaned.replace(' ', '_')
    return cleaned


def generate_markdown_file(row, output_dir):
    """根据一行数据生成Markdown文件"""
    # 获取ID和店铺名称
    fill_id = str(row['填写ID']).strip() if pd.notna(row['填写ID']) else ""
    store_name = str(row['店铺名称']).strip() if pd.notna(row['店铺名称']) else ""

    # 检查ID和店铺名称是否为空
    if not fill_id:
        print(f"ID为空，跳过此行")
        return
    if not store_name:
        print(f"店铺名称为空，跳过此行")
        return

    # 获取美食类别，用于文件名
    food_category = str(row['美食类别']).strip() if pd.notna(row['美食类别']) else "未分类"

    # 创建安全的文件名
    safe_category = clean_filename(food_category)
    safe_id = clean_filename(fill_id)
    safe_store_name = clean_filename(store_name)
    md_filename = f"{safe_category}_{safe_id}_{safe_store_name}.md"

    # 完整的文件路径
    filepath = os.path.join(output_dir, md_filename)

    # 获取其他字段
    reason = str(row['推荐理由']).strip() if pd.notna(row['推荐理由']) else "暂无推荐理由"
    address = str(row['美食地址']).strip() if pd.notna(row['美食地址']) else "未填写地址"

    # 新增打分字段（放在最前面）
    rating = str(row['请打分']).strip() if pd.notna(row['请打分']) else None

    # 新增店铺链接字段（选填）
    store_link = str(row['店铺链接（选填）']).strip() if pd.notna(row['店铺链接（选填）']) and str(
        row['店铺链接（选填）']).strip() != "" else None

    # 可选字段，如果为空则跳过
    price = str(row['人均消费（元）（选填）']).strip() if pd.notna(row['人均消费（元）（选填）']) and str(
        row['人均消费（元）（选填）']).strip() != "" else None
    nickname = str(row['您的昵称（选填）']).strip() if pd.notna(row['您的昵称（选填）']) and str(
        row['您的昵称（选填）']).strip() != "" else None
    contact = str(row['您的联系方式（选填）']).strip() if pd.notna(row['您的联系方式（选填）']) and str(
        row['您的联系方式（选填）']).strip() != "" else None

    # 构建Markdown内容
    md_content = f""" **{store_name}**

"""

    # 添加打分（如果有值，放在最前面）
    if rating:
        try:
            # 将数字转换为对应数量的星号
            rating_num = int(float(rating))  # 处理可能是小数的情况
            stars = "⭐" * rating_num
            md_content += f"- **⭐推荐程度** {stars}\n\n"
        except (ValueError, TypeError):
            # 如果转换失败，保持原样
            md_content += f"- **⭐推荐程度** {rating}星\n\n"

    # 添加人均消费（如果有值）
    if price:
        md_content += f"- **💰人均消费**: {price}元\n\n"

    # 添加店铺链接（如果有值）
    if store_link:
        md_content += f"- **🔗店铺链接**: {store_link}\n\n"

    # 添加地址
    md_content += f"""    
- **🗺️店铺地址**: {address}    



#### 🥣评价：
{reason}

图片：

"""

    # 添加推荐人（如果有值）
    if nickname:
        md_content += f"- 👤推荐人：{nickname}\n"

    md_content += f"""    
- 🕙提交时间: {row['提交时间']}

---
{{
    name: '{store_name}',
    position: [],
    description: '{reason}',
    link: 'out/{food_category}/{store_name}'
}}
"""

    # 写入文件
    try:
        with open(filepath, 'w', encoding='utf-8') as f:
            f.write(md_content)
        print(f"已生成: {filepath}")
    except Exception as e:
        print(f"生成文件 {filepath} 时出错: {e}")


def main():
    excel_file = "广财手册美食投稿.xlsx"
    output_dir = "mdout"

    # 检查文件是否存在
    if not os.path.exists(excel_file):
        print(f"错误: 文件 {excel_file} 不存在")
        return

    # 创建输出目录（如果不存在）
    if not os.path.exists(output_dir):
        os.makedirs(output_dir)
        print(f"已创建输出目录: {output_dir}")

    try:
        # 读取Excel文件，指定工作表名称
        df = pd.read_excel(excel_file, sheet_name='广财手册美食投稿')

        print(f"成功读取Excel文件，共有{len(df)}条记录")
        print(f"Markdown文件将输出到: {output_dir} 目录\n")

        # 遍历每一行数据
        for index, row in df.iterrows():
            fill_id = row['填写ID'] if pd.notna(row['填写ID']) else '无ID'
            store_name = row['店铺名称'] if pd.notna(row['店铺名称']) else '无名店铺'
            food_category = row['美食类别'] if pd.notna(row['美食类别']) else '未分类'
            print(f"处理第{index + 1}条记录: 类别={food_category}, ID={fill_id}, 店铺={store_name}")
            generate_markdown_file(row, output_dir)

        print(f"\n所有文件已生成完成！文件保存在: {output_dir} 目录")

    except Exception as e:
        print(f"读取Excel文件时出错: {e}")


if __name__ == "__main__":
    main()