FROM python:3.12-slim
WORKDIR /servicio
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY app ./app
# Usuario sin privilegios: el proceso de la API no necesita ser root.
RUN useradd --create-home api
USER api
EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
