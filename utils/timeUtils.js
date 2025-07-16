module.exports.getEATISOString = (date = new Date()) => {
  const eatOffsetMs = 3 * 60 * 60 * 1000;
  return new Date(date.getTime() + eatOffsetMs).toISOString();
};

module.exports.getCurrentMonthRange = () => {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  return { start, end };
};
