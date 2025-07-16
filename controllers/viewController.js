exports.getOverview = (req, res, next) => {
  res.json({
    message: 'Awesome the web server works!😎',
    author: 'Isaac Waweru',
    year: '2024',
    for: 'Kipchimchim Group App',
    made_and_maintained_by: 'Crystalgate Technologies',
  });
};
