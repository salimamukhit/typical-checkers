export function getClosestNumFromArr(target, numArr) {
  let closestNum = numArr[0];
  let smallestDiff = 10000;
  for (const num of numArr) {
    const diff = Math.abs(target - num);
    if (diff < smallestDiff) {
      smallestDiff = diff;
      closestNum = num;
    }
  }

  return closestNum;
}

export function updateGameBoardFromChanges(changes, gameBoard) {
  const newGameBoard = {...gameBoard};
  Object.entries(changes).forEach(entry => {
    const y = Number(entry[0]);
    Object.entries(entry[1]).forEach(value => {
      const x = Number(value[0]);
      const player = value[1];
      newGameBoard[y][x] = player;
    });
  });
  return newGameBoard;
}

export function getCheckerStatus(newY, player) {
  if (player === 'whitePlayer') {
    if (newY === 1) {
      return 'whitePlayerQueen';
    }
  } else if (player === 'blackPlayer') {
    if (newY === 8) {
      return 'blackPlayerQueen';
    }
  }

  return player;
}

/**
 * Gets the possible X coordinates where a checker can make its move
 */
export function getPossibleXs(x) {
  if (x === 1) {
    return [(x + 1)];
  } else if (x === 8) {
    return [(x - 1)];
  }
  return [(x - 1), (x + 1)];
}

/**
 * Gets possible X coordinates where a checker can make its jump.
 */
export function getPossibleJumpXs(x) {
  if (x < 3) {
    return [(x + 2)];
  } else if (x > 6) {
    return [(x - 2)];
  }
  return [(x - 2), (x + 2)];
}

export function isMandatoryJump(point, mandatoryJumpMoves) {
  const isMandatoryJump = mandatoryJumpMoves.find(pt => pt.x === point.x && pt.y === point.y);
  return Boolean(isMandatoryJump);
}

export function getMandatoryJumpCheckers(gameBoard, playerTurn) {
  const checkerCoordinates = [];
  Object.entries(gameBoard).forEach(entry => {
    const y = Number(entry[0]);
    const cells = entry[1];
    Object.entries(cells).forEach(cellEntry => {
      const x = Number(cellEntry[0]);
      const player = cellEntry[1];
      if (player && player.startsWith(playerTurn)) {
        const jumpMoves = getPossibleMoves(gameBoard, x, y, true);
        if (jumpMoves.length > 0) {
          checkerCoordinates.push({ x, y });
        }
      }
    })
  });

  return checkerCoordinates;
}

export function getPossibleMoves(gameBoard, x, y, jumpsOnly) {
  const player = gameBoard[y][x];
  if (player === null) {
    return [];    
  }
  const opposingPlayer = player.startsWith('whitePlayer') ? 'blackPlayer' : 'whitePlayer';
  if (player === 'whitePlayer') {
    return getMoves(gameBoard, x, y, opposingPlayer, 'top', player, jumpsOnly);
  } else if (player === 'blackPlayer') {
    return getMoves(gameBoard, x, y, opposingPlayer, 'bottom', player, jumpsOnly);
  } else if (player.includes('Queen')) {
    const topMoves = getMoves(gameBoard, x, y, opposingPlayer, 'top', player, jumpsOnly);
    const bottomMoves = getMoves(gameBoard, x, y, opposingPlayer, 'bottom', player, jumpsOnly);
    const allMoves = topMoves.concat(bottomMoves);
    const jumpMoves = allMoves.filter(move => move.isJump === true);
    if (jumpMoves.length > 0) {
      return jumpMoves;
    }
    return allMoves;
  }

  return [];
}

export function getMoves(gameBoard, x, y, opposingPlayer, direction, player, jumpsOnly) {
  const moves = [];
  const jumpMoves = [];
  const newY = direction === 'top' ? y - 1 : y + 1;
  const newYJump = direction === 'top' ? y - 2 : y + 2;
  const possibleXs = getPossibleXs(x);
  const possibleJumpXs = getPossibleJumpXs(x);
  possibleXs.forEach(numX => {
    if (gameBoard[newY] && gameBoard[newY][numX] === null && !jumpsOnly) {
      moves.push(
        {
          x: numX,
          y: newY,
          currentPos: { x, y },
          changes: {
            [y]: {
              [x]: null
            },
            [newY]: {
              [numX]: getCheckerStatus(newY, player)
            }
          }
        }
      );
    } else if (numX < 8 && numX > 1 && gameBoard[newY] && gameBoard[newY][numX]?.startsWith(opposingPlayer)) {
      const jumpX = getClosestNumFromArr(numX, possibleJumpXs);
      if (gameBoard[newYJump] && gameBoard[newYJump][jumpX] === null) {
        jumpMoves.push(
          {
            x: jumpX,
            y: newYJump,
            currentPos: { x, y },
            changes: {
              [y]: {
                [x]: null
              },
              [newYJump]: {
                [jumpX]: getCheckerStatus(newYJump, player)
              },
              [newY]: {
                [numX]: null
              }
            },
            isJump: true,
          }
        );
      }
    }
  });

  /** If a jump is possible a player has to take it */
  if (jumpMoves.length > 0) {
    return jumpMoves;
  }

  return moves;
}

export function determineWinner(gameBoard) {
  let whitePlayerCount = 0;
  let blackPlayerCount = 0;

  Object.entries(gameBoard).forEach(entry => {
    Object.entries(entry[1]).forEach(cell => {
      const player = cell[1];
      if (player) {
        if (player.startsWith('whitePlayer')) {
          whitePlayerCount++;
        } else if (player.startsWith('blackPlayer')) {
          blackPlayerCount++;
        }
      }
    });
  });

  if (whitePlayerCount === 0) {
    return 'blackPlayer';
  } else if (blackPlayerCount === 0) {
    return 'whitePlayer';
  }

  return null;
}