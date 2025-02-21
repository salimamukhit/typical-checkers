require('dotenv').config();
const express = require('express');
const app = express();
const http = require('http');
const server = http.createServer(app);
const cors = require('cors');
const { Server } = require("socket.io");
const { randomBytes } = require('crypto');
const { initialBoard } = require('./initialBoard.js');
const mongoose = require('mongoose');
const mongodb = mongoose.connect(process.env.MONGOOSE_URL);
const cookieParser = require('cookie-parser');

const gameSchema = new mongoose.Schema({
  gameId: String,
  whitePlayer: Object, // token and username and updating
  blackPlayer: Object, // token and username and updating
  gameBoard: Object,
  playerTurn: String,
  private: Boolean,
  mandatoryJumpMoves: Array,
  activeCheckerPossibleMoves: Array,
  activeChecker: Object,
  winner: String,
});

const Game = mongoose.model('Game', gameSchema);

const io = new Server(server, {
  cors: {
    origin: "http://192.168.0.228:3000",
    methods: ["GET", "POST"],
  },
});

app.use(cors({ origin: 'http://192.168.0.228:3000', methods: ["GET", "POST"], credentials: true, }));
app.use(express.json());
app.use(cookieParser());

mongodb.then(mongo => {
  app.get('/', async (req, res) => {
    return res.send("Welcome to checkers backend");
  });
  
  app.get('/activeGames', async (req, res) => {
    try {
      const games = await Game.find();
      const activeGameIds = [];
      games.forEach(game => {
        if ((!game.whitePlayer || !game.blackPlayer) && !game.private) {
          activeGameIds.push(game.gameId);
        }
      });
      return res.status(200).send({ activeGameIds });
    } catch (e) {
      console.error('Unknown server error occurred', e);
      return res.status(500).send({ message: 'Unknown server error occurred' });
    }
  });
  
  // create a new game, get the id back
  app.post('/game', async (req, res) => {
    const { private } = req.body;
    try {
      const game = await Game.create({
        gameId: randomBytes(32).toString('base64').replace(/[^a-zA-Z0-9]/g, '').slice(0, 10),
        gameBoard: initialBoard,
        playerTurn: 'whitePlayer',
        private: Boolean(private),
      });
      // if the game is public we want to notify connected clients that it was created
      if (!private) {
        io.emit('game created', { gameId: game.gameId });
      }
      return res.status(200).send({ gameId: game.gameId });
    } catch (e) {
      console.error('Unknown server error occurred', e);
      return res.status(500).send({ message: 'Unknown server error occurred' });
    }
  });
  
  app.get('/game', async (req, res) => {
    try {
      const { gameId } = req.query;
      const game = (await Game.find({ gameId }))[0];
      if (!game) {
        return res.status(404).send({ message: 'Game with such id was not found' });
      }
      return res.status(200).send(
        {
          gameBoard: game.gameBoard,
          playerTurn: game.playerTurn,
          whitePlayer: game.whitePlayer ? { username: game.whitePlayer.username } : null,
          blackPlayer: game.blackPlayer ? { username: game.blackPlayer.username } : null,
          activeChecker: game.activeChecker,
          activeCheckerPossibleMoves: game.activeCheckerPossibleMoves,
          mandatoryJumpMoves: game.mandatoryJumpMoves,
        }
      );
    } catch (e) {
      console.error('Unknown server error occurred', e);
      return res.status(500).send({ message: 'Unknown server error occurred' });
    }
  });

  app.post('/game/connectPlayer', async (req, res) => {
    try {
      const { gameId, username } = req.body;
      if (!gameId) {
        console.log(gameId);
        return res.status(400).send({ message: 'Must provide valid gameId!' });
      }
      const game = (await Game.find({ gameId }))[0];
      if (!game) {
        return res.status(404).send({ message: 'Game with such id was not found' });
      }

      const gameIdCookie = req.cookies[`typicalCheckersGameId${gameId}`];
      if (gameIdCookie) {
        if (game.whitePlayer?.token === gameIdCookie) {
          io.emit(`player connected ${gameId}`, { username: game.whitePlayer.username, playerTurn: 'whitePlayer' });
          return res.status(200).send({ currPlayer: 'whitePlayer' });
        } else if (game.blackPlayer?.token === gameIdCookie) {
          io.emit(`player connected ${gameId}`, { username: game.blackPlayer.username, playerTurn: 'blackPlayer' });
          return res.status(200).send({ currPlayer: 'blackPlayer' });
        } else {
          return res.status(401).send({ message: 'You are not authorized to join this game' });
        }
      }

      // if the existing player is not reconnecting and the game is full then it is not possible to connect
      if (game.whitePlayer && game.blackPlayer) {
        return res.status(401).send({ message: 'This game is at full capacity' });
      }

      // if the game is not at full capacity, provide the player for the user
      if (!username) {
        return res.status(401).send({ message: 'Must provide a valid username to join a game' });
      }
      if (!game.whitePlayer) {
        game.set('whitePlayer', { updating: true });
        await game.save();
        game.set('whitePlayer', {
          token: randomBytes(32).toString('base64').replace(/[^a-zA-Z0-9]/g, '').slice(0, 7),
          username,
          updating: false,
        });
        await game.save();
        res.cookie(`typicalCheckersGameId${gameId}`, game.whitePlayer.token, {
          maxAge: 86400000, // Cookie expires in 24 hours
          httpOnly: true, // Cookie is not accessible via JavaScript
          secure: false, // Set to true if using HTTPS
          sameSite: 'lax',
        });
        io.emit(`player connected ${gameId}`, { username: game.whitePlayer.username, playerTurn: 'whitePlayer' });
        return res.status(200).send({ currPlayer: 'whitePlayer' });
      } else if (!game.blackPlayer) {
        game.set('blackPlayer', { updating: true });
        await game.save();
        game.set('blackPlayer', {
          token: randomBytes(32).toString('base64').replace(/[^a-zA-Z0-9]/g, '').slice(0, 7),
          username,
          updating: false,
        });
        await game.save();
        res.cookie(`typicalCheckersGameId${gameId}`, game.blackPlayer.token, {
          maxAge: 86400000, // Cookie expires in 24 hours
          httpOnly: true, // Cookie is not accessible via JavaScript
          secure: false, // Set to true if using HTTPS
          sameSite: 'lax',
        });
        io.emit(`player connected ${gameId}`, { username: game.blackPlayer.username, playerTurn: 'blackPlayer' });
        return res.status(200).send({ currPlayer: 'blackPlayer' });
      }
    } catch (e) {
      console.error('Unknown server error occurred', e);
      return res.status(500).send({ message: 'Unknown server error occurred' });
    }
  });
  
  // validate player from cookies
  // validate the player turn
  app.post('/game/tileClick', async (req, res) => {
    const { gameId } = req.body;
    const game = (await Game.find({ gameId }))[0];
    if (!game) {
      return res.status(401).send({ message: 'Game with such id was not found' });
    }
    const playerToken = req.cookies[`typicalCheckersGameId${gameId}`];
    if (!playerToken) {
      return res.status(401).send({ message: 'You are not authorized to join this game' });
    }
    if (playerToken === game.whitePlayer.token && game.playerTurn === 'whitePlayer') {
      // logic
      // io.emit(`board updated ${gameId}`)
    } else if (playerToken === game.whitePlayer.token && game.playerTurn === 'whitePlayer') {
      //logic
      // io.emit(`board updated ${gameId}`)
    }
  });
});

server.listen(3001, '0.0.0.0', () => {
  console.log('listening on *:3001');
});