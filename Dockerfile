FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    TZ=Asia/Shanghai

WORKDIR /app

COPY requirements.txt /app/requirements.txt
RUN pip install --no-cache-dir -r /app/requirements.txt

COPY app_server.py server.py /app/
COPY db /app/db
COPY assets/plant-panorama.jpg /app/assets/plant-panorama.jpg
COPY filemaker_script/seed_data /app/filemaker_script/seed_data

EXPOSE 8765

CMD ["sh", "-c", "python3 -m db.migrate_sqlite_to_mysql && uvicorn app_server:app --host 0.0.0.0 --port 8765 --workers ${WMPSES_WORKERS:-4}"]
