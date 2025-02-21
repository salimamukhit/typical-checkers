require('dotenv').config();
const express = require('express');
const app = express();
const http = require('http');
const server = http.createServer(app);
const cors = require('cors');
const { Server } = require("socket.io");
const { randomBytes } = require('crypto');
const { initialBoard } = require('./initialBoard.js');
const {
  getMandatoryJumpCheckers,
  updateGameBoardFromChanges,
  isMandatoryJump,
  getPossibleMoves,
  determineWinner,
} = require('./board.js');
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
      const activeGameIds = await Game.find({ private: false, $or: [{ whitePlayer: null }, { blackPlayer: null }] }).select('gameId').lean().then(results => {
        return results.map(doc => doc.gameId);
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
        winner: null,
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

    // resets all the game properties and switches players
    app.post('/game/reset', async (req, res) => {
      const { gameId } = req.body;
      try {
        const game = (await Game.find({ gameId }))[0];
        if (!game) {
          return res.status(404).send({ message: 'Game with such id was not found' });
        }

        const gameIdCookie = req.cookies[`typicalCheckersGameId${gameId}`];
        if (!gameIdCookie || (game.whitePlayer?.token !== gameIdCookie && game.blackPlayer?.token !== gameIdCookie)) {
          return res.status(401).send({ message: 'You are not authorized to the reset this game' });
        }

        if (!game.winner) {
          return res.status(401).send({ message: 'Game without a winner cannot be reset' });
        }

        game.set('gameBoard', initialBoard);
        game.markModified('gameBoard');
        game.set('playerTurn', 'whitePlayer');
        game.set('mandatoryJumpMoves', []);
        game.set('activeCheckerPossibleMoves', []);
        game.set('activeChecker', null);
        game.set('winner', null);

        const temp = { username: game.whitePlayer.username, token: game.whitePlayer.token };
        game.set('whitePlayer', { username: game.blackPlayer.username, token: game.blackPlayer.token });
        game.set('blackPlayer', temp);
        game.markModified('whitePlayer');
        game.markModified('blackPlayer');
        await game.save();
        io.emit(`game board updated`, getGameProps(game));

        return res.status(200).send({ ...getGameProps(game) });
      } catch (e) {
        console.error('Unknown server error occurred', e);
        return res.status(500).send({ message: 'Unknown server error occurred' });
      }
    });
  
  function getGameProps(game) {
    return {
      gameBoard: game.gameBoard,
      playerTurn: game.playerTurn,
      whitePlayer: game.whitePlayer ? { username: game.whitePlayer.username } : null,
      blackPlayer: game.blackPlayer ? { username: game.blackPlayer.username } : null,
      activeChecker: game.activeChecker,
      activeCheckerPossibleMoves: game.activeCheckerPossibleMoves,
      mandatoryJumpMoves: game.mandatoryJumpMoves,
      winner: game.winner,
    };
  }

  app.get('/game', async (req, res) => {
    try {
      const { gameId } = req.query;
      const game = (await Game.find({ gameId }))[0];
      if (!game) {
        return res.status(404).send({ message: 'Game with such id was not found' });
      }
      return res.status(200).send(getGameProps(game));
    } catch (e) {
      console.error('Unknown server error occurred', e);
      return res.status(500).send({ message: 'Unknown server error occurred' });
    }
  });

  app.post('/game/connectPlayer', async (req, res) => {
    try {
      const { gameId, username } = req.body;
      if (!gameId) {
        return res.status(400).send({ message: 'Must provide valid gameId!' });
      }
      const game = (await Game.find({ gameId }))[0];
      if (!game) {
        return res.status(404).send({ message: 'Game with such id was not found' });
      }

      const gameIdCookie = req.cookies[`typicalCheckersGameId${gameId}`];
      if (gameIdCookie) {
        if (game.whitePlayer?.token === gameIdCookie) {
          io.emit(`player connected`, { username: game.whitePlayer.username, playerTurn: 'whitePlayer', gameId });
          return res.status(200).send({ currPlayer: 'whitePlayer' });
        } else if (game.blackPlayer?.token === gameIdCookie) {
          io.emit(`player connected`, { username: game.blackPlayer.username, playerTurn: 'blackPlayer', gameId });
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
        io.emit(`player connected`, { username: game.whitePlayer.username, playerTurn: 'whitePlayer', gameId });
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
        io.emit(`player connected`, { username: game.blackPlayer.username, playerTurn: 'blackPlayer', gameId });
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
    try {
      const { gameId, x, y } = req.body;
      const game = (await Game.find({ gameId }))[0];
      if (!game) {
        return res.status(401).send({ message: 'Game with such id was not found' });
      }
  
      if (!x || !y) {
        return res.status(401).send({ message: 'Must provide X and Y coordinates' });
      }
  
      const playerToken = req.cookies[`typicalCheckersGameId${gameId}`];
      if (!playerToken) {
        return res.status(401).send({ message: 'You are not authorized to join this game' });
      }
  
      if (playerToken === game[game.playerTurn].token) {
        if (game.activeChecker) {
          const move = game.activeCheckerPossibleMoves.find(entry => entry.x === x && entry.y === y);
          if (move) {
            const newGameBoard = updateGameBoardFromChanges(move.changes, game.gameBoard);
            game.set('gameBoard', newGameBoard);
            game.markModified('gameBoard');
            const moreMoves = move.isJump ? getPossibleMoves(game.gameBoard, move.x, move.y, true) : [];
            if (moreMoves.length === 0) {
              game.set('activeChecker', null);
              game.set('activeCheckerPossibleMoves', []);
              if (game.playerTurn === 'whitePlayer') {
                game.set('playerTurn', 'blackPlayer');
              } else {
                game.set('playerTurn', 'whitePlayer');
              }
              const mandatoryJumpMoves = getMandatoryJumpCheckers(game.gameBoard, game.playerTurn);
              game.set('mandatoryJumpMoves', mandatoryJumpMoves);
              await game.save();
              io.emit(`game board updated`, getGameProps(game));
            } else {
              game.set('activeCheckerPossibleMoves', moreMoves);
              game.set('activeChecker', { x: move.x, y: move.y });
              await game.save();
              io.emit(`game board updated`, getGameProps(game));
            }
          }
        } else if (game.mandatoryJumpMoves.length === 0 || (game.mandatoryJumpMoves.length > 0 && isMandatoryJump({ x, y }, game.mandatoryJumpMoves))) {
            if (!game.activeChecker && game.gameBoard[y][x]?.startsWith(game.playerTurn)) {
              const moves = getPossibleMoves(game.gameBoard, x, y);
              if (moves.length > 0) {
                game.set('activeChecker', { x, y });
                game.set('activeCheckerPossibleMoves', moves);
                await game.save();
                io.emit(`game board updated`, getGameProps(game));
              }
            }
          }

          const winner = determineWinner(game.gameBoard);
          if (winner !== null) {
            game.set('winner', winner);
            await game.save();
            io.emit(`game board updated`, getGameProps(game));
          }
        }
      return res.status(200).send({});
    } catch (e) {
      console.error('Unknown server error occurred', e);
      return res.status(500).send({ message: 'Unknown server error occurred' });
    }
  });
});

server.listen(3001, '0.0.0.0', () => {
  console.info('listening on *:3001');
});