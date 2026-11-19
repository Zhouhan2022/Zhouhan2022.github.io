"""构建后把每篇文章的原始 Markdown 复制到 site/raw/，供站内编辑器读取。"""
import pathlib
import shutil


def on_post_build(config, **kwargs):
    docs = pathlib.Path(config["docs_dir"])
    site = pathlib.Path(config["site_dir"])
    raw = site / "raw"
    if raw.exists():
        shutil.rmtree(raw)
    count = 0
    for md in sorted(docs.rglob("*.md")):
        rel = md.relative_to(docs)
        dest = raw / rel
        dest.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(md, dest)
        count += 1
    print(f"[raw-md] copied {count} markdown files -> site/raw/")
