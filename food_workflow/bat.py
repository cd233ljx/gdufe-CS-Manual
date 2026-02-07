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
    # 获取店铺名称
    store_name = str(row['店铺名称']).strip()
    if not store_name:
        print(f"店铺名称为空，跳过此行")
        return

    # 创建安全的文件名
    safe_filename = clean_filename(store_name)
    md_filename = f"{safe_filename}.md"

    # 完整的文件路径
    filepath = os.path.join(output_dir, md_filename)

    # 获取其他字段
    food_category = str(row['美食类别']).strip() if pd.notna(row['美食类别']) else "未分类"
    reason = str(row['推荐理由']).strip() if pd.notna(row['推荐理由']) else "暂无推荐理由"
    address = str(row['美食地址（可选填具体店铺或区域）']).strip() if pd.notna(
        row['美食地址（可选填具体店铺或区域）']) else "未填写地址"
    campus = str(row['所在校区']).strip() if pd.notna(row['所在校区']) else "未指定校区"

    # 可选字段，如果为空则跳过
    price = str(row['人均消费（元）（选填）']).strip() if pd.notna(row['人均消费（元）（选填）']) and str(
        row['人均消费（元）（选填）']).strip() != "" else None
    nickname = str(row['您的昵称（选填）']).strip() if pd.notna(row['您的昵称（选填）']) and str(
        row['您的昵称（选填）']).strip() != "" else None
    contact = str(row['您的联系方式（选填）']).strip() if pd.notna(row['您的联系方式（选填）']) and str(
        row['您的联系方式（选填）']).strip() != "" else None

    # 构建Markdown内容
    md_content = f"""# {store_name}

### 基本信息
- **美食类别**: {food_category}
- **所在校区**: {campus}
"""

    # 添加人均消费（如果有值）
    if price:
        md_content += f"- **人均消费**: {price}元\n"

    # 添加推荐人（如果有值）
    if nickname:
        md_content += f"- **推荐人**: {nickname}\n"

    # 添加联系方式（如果有值）
    if contact:
        md_content += f"- **联系方式**: {contact}\n"

    md_content += f"""
### 店铺地址
{address}

### 推荐理由
{reason}

### 提交信息
- 提交时间: {row['提交时间']}

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
            store_name = row['店铺名称'] if pd.notna(row['店铺名称']) else '无名店铺'
            print(f"处理第{index + 1}条记录: {store_name}")
            generate_markdown_file(row, output_dir)

        print(f"\n所有文件已生成完成！文件保存在: {output_dir} 目录")

    except Exception as e:
        print(f"读取Excel文件时出错: {e}")


if __name__ == "__main__":
    main()