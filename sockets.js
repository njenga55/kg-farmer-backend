// const pongGame = require('./sockets/games');
const walletUpdate = require('./sockets/walletUpdate');

function listen(io) {
  // Pong game namespace
  //   const pongNamespace = io.of('/pong');
  //   pongGame(pongNamespace);

  // Other namespace(s)
  const walletNamespace = io.of('/wallet');
  walletUpdate(walletNamespace);
}

module.exports = {
  listen,
};
