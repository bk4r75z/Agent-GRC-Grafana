FROM python:3.13-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY grc_agent ./grc_agent
ENV PYTHONUNBUFFERED=1
CMD ["python", "-m", "grc_agent.main", "--schedule"]
