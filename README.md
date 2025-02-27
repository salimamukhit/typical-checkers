This is the simple Express.js application which serves as a backend for [Typical Checkers frontend](https://github.com/salimamukhit/typical-checkers-game).

To run this application locally:

1. Ensure that you have [Node](https://nodejs.org/en/download) installed on your machine.
2. Ensure that you have mongoDB database. This application uses [MongoDB Atlas Free Tier](https://www.mongodb.com/products/platform/atlas-database) cluster.
3. Create an .env file in the root of this directory and ensure to set these variables: `ORIGIN_URL` (which is the URL of the front-end checkers application - note that it has to be a local IP address) and (MONGOOSE_URL) which is the connection string to your MongoDB database
4. In the root of this directory run `npm install` to install all the dependencies.
5. Then run `node index.js` to start the backend on port 3001. Navigate to localhost:3001 and ensure that the backend is running.
6. Now you will be able to play checkers with someone on your local network by navigating to `<local_ip_address>:3000`.
