# Dockerfile untuk Export Supabase Data
FROM node:18-alpine

WORKDIR /app

# Copy script
COPY export-supabase.js .

# Create output directory
RUN mkdir -p /app/output

# Set environment variables (override saat run)
ENV SUPABASE_URL=""
ENV SUPABASE_ANON_KEY=""
ENV OUTPUT_DIR="/app/output"

# Run export script
CMD ["node", "export-supabase.js"]
