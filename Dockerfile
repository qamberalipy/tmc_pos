# 1. Use a lightweight Python base image
FROM python:3.11-slim

# 2. Set the timezone to Karachi
ENV TZ=Asia/Karachi
RUN ln -snf /usr/share/zoneinfo/$TZ /etc/localtime && echo $TZ > /etc/timezone

# 3. Set the working directory inside the container
WORKDIR /app

# 4. Copy only the requirements first (to cache the installation step)
COPY requirements.txt .

# 5. Install the exact dependencies from your requirements.txt
RUN pip install --no-cache-dir -r requirements.txt

# 6. Copy the rest of your app files (app/, migrations/, run.py, key.py)
COPY . .

# 7. Expose the port Flask runs on
EXPOSE 5000

# 8. Start the app using Gunicorn pointing to app variable in run.py
CMD ["gunicorn", "-w", "4", "-b", "0.0.0.0:5000", "run:app"]