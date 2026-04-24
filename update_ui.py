import os
import re

css = """
        :root {
            --bg-color: #F8F5F1;
            --border-color: #0F0E0E;
            --accent-red: #E03131;
            --accent-yellow: #FCC419;
            --text-main: #0F0E0E;
        }

        * {
            box-sizing: border-box;
            margin: 0;
            padding: 0;
        }

        body {
            font-family: 'Chivo', 'Noto Serif SC', sans-serif;
            background-color: var(--bg-color);
            color: var(--text-main);
            min-height: 100vh;
            padding: 40px 20px;
            display: flex;
            flex-direction: column;
            align-items: center;
            overflow-x: hidden;
        }

        /* Marquee effect for brutalist style */
        .marquee {
            width: 100vw;
            background: var(--accent-red);
            color: #fff;
            padding: 10px 0;
            border-top: 3px solid var(--border-color);
            border-bottom: 3px solid var(--border-color);
            font-family: 'Syne', sans-serif;
            font-weight: 800;
            text-transform: uppercase;
            white-space: nowrap;
            overflow: hidden;
            position: absolute;
            top: 0;
            left: 0;
            z-index: 10;
        }
        .marquee span {
            display: inline-block;
            padding-left: 100%;
            animation: marquee 15s linear infinite;
        }
        @keyframes marquee {
            0% { transform: translate(0, 0); }
            100% { transform: translate(-100%, 0); }
        }

        .container {
            background-color: #fff;
            border: 3px solid var(--border-color);
            box-shadow: 12px 12px 0px var(--border-color);
            padding: 3rem;
            border-radius: 0;
            max-width: 850px;
            width: 100%;
            margin: 40px auto 0;
            position: relative;
        }

        h1, h2, h3, .title {
            font-family: 'Syne', 'ZCOOL XiaoWei', serif;
            font-weight: 800;
            text-transform: uppercase;
            color: var(--text-main);
            text-shadow: 2px 2px 0px var(--accent-yellow);
            margin-bottom: 1.5rem;
            border-bottom: 3px solid var(--border-color);
            padding-bottom: 10px;
            display: inline-block;
        }

        /* Make the icon block brutalist */
        .icon-wrapper {
            width: 80px;
            height: 80px;
            background: var(--accent-red);
            border: 3px solid var(--border-color);
            box-shadow: 6px 6px 0px var(--border-color);
            display: flex;
            align-items: center;
            justify-content: center;
            margin: 0 auto 2rem;
            transform: rotate(-3deg);
            transition: transform 0.2s;
        }
        .container:hover .icon-wrapper {
            transform: rotate(3deg) scale(1.1);
        }
        .icon-wrapper svg {
            width: 40px;
            height: 40px;
            color: #fff;
        }

        /* Forms */
        .form-group {
            margin-bottom: 1.5rem;
            text-align: left;
        }
        label {
            display: block;
            font-weight: 800;
            margin-bottom: 0.5rem;
            text-transform: uppercase;
        }
        input[type="text"],
        input[type="password"],
        textarea, select {
            width: 100%;
            border: 3px solid var(--border-color);
            padding: 1rem;
            font-family: 'Chivo', sans-serif;
            font-weight: bold;
            font-size: 1rem;
            box-shadow: 4px 4px 0px var(--border-color);
            border-radius: 0;
            transition: all 0.2s;
            background: #fff;
        }
        input:focus, textarea:focus, select:focus {
            outline: none;
            box-shadow: 8px 8px 0px var(--border-color);
            transform: translate(-2px, -2px);
            background: #fffafa;
        }

        /* Buttons matching the style */
        button, .btn, .logout, .approve, .reject, .back {
            background-color: var(--accent-yellow);
            color: var(--text-main);
            border: 3px solid var(--border-color);
            padding: 1rem 1.5rem;
            font-family: 'Chivo', sans-serif;
            font-weight: 800;
            font-size: 1rem;
            text-transform: uppercase;
            cursor: pointer;
            box-shadow: 6px 6px 0px var(--border-color);
            transition: all 0.2s;
            border-radius: 0;
            display: inline-flex;
            align-items: center;
            justify-content: center;
            text-decoration: none;
            margin-top: 10px;
            margin-right: 10px;
        }
        button:hover, .btn:hover, .logout:hover, .approve:hover, .back:hover {
            background-color: var(--accent-red);
            color: #fff;
            transform: translate(-3px, -3px);
            box-shadow: 9px 9px 0px var(--border-color);
        }
        button:active, .btn:active, .logout:active, .approve:active, .back:active {
            transform: translate(0, 0);
            box-shadow: 0px 0px 0px var(--border-color);
        }

        .btn-secondary { background-color: #fff; }
        .reject { background-color: var(--accent-red); color: white; }
        .reject:hover { background-color: var(--text-main); }

        .flash {
            background: var(--accent-yellow);
            border: 3px solid var(--border-color);
            padding: 1rem;
            margin-bottom: 2rem;
            box-shadow: 6px 6px 0px var(--border-color);
            font-weight: 800;
            display: flex;
            align-items: center;
            gap: 10px;
        }

        /* Submissions */
        .submission {
            background: #fff;
            border: 3px solid var(--border-color);
            padding: 1.5rem;
            margin-bottom: 2rem;
            box-shadow: 8px 8px 0px var(--border-color);
            text-align: left;
            position: relative;
        }
        .category-tag {
            background: var(--accent-yellow);
            border: 2px solid var(--border-color);
            padding: 0.3rem 0.6rem;
            font-weight: 800;
            text-transform: uppercase;
            font-size: 0.8rem;
            box-shadow: 2px 2px 0px var(--border-color);
            display: inline-block;
            margin-top: 10px;
        }

        /* Utility */
        .header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            border-bottom: 3px solid var(--border-color);
            padding-bottom: 1rem;
            margin-bottom: 2rem;
        }
        .comments-section h2 { border-bottom: none; }
        
        /* Carousel override for brutalist */
        .carousel {
            border: 4px solid var(--border-color);
            box-shadow: 10px 10px 0px var(--border-color);
            border-radius: 0;
            margin: 2.5rem 0;
            overflow: hidden;
            position: relative;
        }
        .carousel-indicators {
            bottom: 10px;
            background: var(--border-color);
            border: 2px solid var(--border-color);
            border-radius: 0;
        }
        .carousel-indicator {
            border-radius: 0;
            width: 15px;
            height: 15px;
            border: 1px solid #fff;
        }
"""

font_links = """
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Chivo:wght@400;700;800&family=Fraunces:opsz,wght@9..144,700;9..144,800&family=Noto+Serif+SC:wght@700;900&family=Syne:wght@700;800&family=ZCOOL+XiaoWei&display=swap" rel="stylesheet">
"""

templates_dir = "food_app/templates"
files = ["index.html", "login.html", "review.html", "submit.html"]

for f in files:
    path = os.path.join(templates_dir, f)
    with open(path, "r", encoding="utf-8") as file:
        content = file.read()
    
    # Replace style
    content = re.sub(r'<style>.*?</style>', f'<style>{css}</style>', content, flags=re.DOTALL)
    
    # Replace old font links
    content = re.sub(r'<link href="https://fonts.googleapis.com[^>]+>', font_links, content)
    
    # Inject marquee if body doesn't have it (optional but fun)
    if 'class="marquee"' not in content:
        content = re.sub(r'(<body[^>]*>)', r'\1\n    <div class="marquee"><span>FOOD APP REDESIGN — SUBMIT YOUR FAVORITES EXCLUSIVE — BOLD FLAVORS — FOOD APP REDESIGN</span></div>', content, count=1)
        
    with open(path, "w", encoding="utf-8") as file:
        file.write(content)
        
print("Successfully redesigned the templates!")
