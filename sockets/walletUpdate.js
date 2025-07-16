const Wallet = require('./../models/walletModel');

function walletUpdate(nameSpace) {
  nameSpace.on('connection', (socket) => {
    const changeStream = Wallet.watch();

    changeStream.on('change', (change) => {
      if (change.operationType === 'update') {
        // Emit to the client
        socket.emit('newUpdate', change.documentKey._id.toString());
      }
    });

    changeStream.on('error', (error) => {
      console.error('Error with change stream:', error);
    });
  });
}

module.exports = walletUpdate;
