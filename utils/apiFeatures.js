class APIFeatures {
  constructor(query, queryString) {
    this.query = query;
    this.queryString = queryString;
  }

  filter() {
    const queryObj = { ...this.queryString };
    const excludedFields = [
      'page',
      'sort',
      'limit',
      'fields',
      'search',
      'searchFields',
    ];
    excludedFields.forEach((el) => delete queryObj[el]);

    // Advanced filtering
    let queryStr = JSON.stringify(queryObj);
    queryStr = queryStr.replace(/\b(gte|gt|lte|lt)\b/g, (match) => `$${match}`);

    this.query = this.query.find(JSON.parse(queryStr));

    return this;
  }

  sort() {
    if (this.queryString.sort) {
      const sortBy = this.queryString.sort.split(',').join(' ');
      this.query = this.query.sort(sortBy);
    } else {
      this.query = this.query.sort('-createdAt');
    }

    return this;
  }

  limitFields() {
    if (this.queryString.fields) {
      const fields = this.queryString.fields.split(',').join(' ');
      this.query = this.query.select(fields);
    } else {
      this.query = this.query.select('-__v');
    }

    return this;
  }

  async paginate() {
    const page = this.queryString.page * 1 || 1;
    const limit = this.queryString.limit * 1 || 100;
    const skip = (page - 1) * limit;

    const totalDocuments = await this.query.model.countDocuments(
      this.query.getFilter(),
    );
    const totalPages = Math.ceil(totalDocuments / limit);

    this.query = this.query.skip(skip).limit(limit);

    return {
      totalDocuments,
      totalPages,
      currentPage: page,
    };
  }

  search() {
    if (this.queryString.search && this.queryString.searchFields) {
      const searchTerm = this.queryString.search;
      const fields = this.queryString.searchFields.split(',');

      const searchConditions = fields.map((field) => ({
        [field]: { $regex: searchTerm, $options: 'i' },
      }));

      this.query = this.query.find({ $or: searchConditions });
    }

    return this;
  }
}

module.exports = APIFeatures;
