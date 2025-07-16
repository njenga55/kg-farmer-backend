# Use the official Node.js image as the base
FROM node:lts-alpine

# Set the working directory in the container
WORKDIR /app

# Copy the package.json and install dependencies
COPY package*.json .
RUN npm install --omit=dev

# Copy the rest of the application files
COPY . .

# Expose the port the app runs on
EXPOSE 4000

CMD ["node", "server.js"]