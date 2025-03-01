To run this application locally:

1. Ensure that you have [Node](https://nodejs.org/en/download) installed on your machine.
2. Ensure that you have mongoDB database. This application uses [MongoDB Atlas Free Tier](https://www.mongodb.com/products/platform/atlas-database) cluster.
3. Create an .env file in the root of this directory and ensure to set the `MONGOOSE_URL` variable, which is the connection string to your MongoDB database
4. In the root of this directory run `npm install` to install all the dependencies.
5. Then run `node index.js` to start the backend on port 3001. Navigate to localhost:3001 and ensure that the backend is running.
6. Now you will be able to play checkers with someone on your local network by navigating to `<local_ip_address>:3001`.
