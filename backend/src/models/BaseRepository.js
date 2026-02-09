import { PrismaClient } from '@prisma/client';

export class BaseRepository {
  constructor() {
    this.prisma = new PrismaClient();
  }

  /**
   * 获取Prisma客户端实例
   * @returns {PrismaClient}
   */
  getPrisma() {
    return this.prisma;
  }

  /**
   * 开始事务
   * @returns {Promise<Prisma.TransactionClient>}
   */
  async beginTransaction() {
    return this.prisma.$transaction;
  }

  /**
   * 执行事务
   * @param {Function} callback - 事务回调函数
   * @returns {Promise<any>}
   */
  async executeTransaction(callback) {
    return this.prisma.$transaction(callback);
  }

  /**
   * 分页查询
   * @param {Object} options - 分页选项
   * @param {number} options.page - 页码
   * @param {number} options.limit - 每页数量
   * @param {Object} options.where - 查询条件
   * @param {Object} options.orderBy - 排序条件
   * @param {Object} options.include - 关联查询
   * @returns {Promise<{data: Array, pagination: Object}>}
   */
  async paginate({
    page = 1,
    limit = 20,
    where = {},
    orderBy = { id: 'desc' },
    include = undefined
  }) {
    const skip = (page - 1) * limit;

    const [data, total] = await Promise.all([
      this.prisma[this.modelName].findMany({
        where,
        orderBy,
        include,
        skip,
        take: limit
      }),
      this.prisma[this.modelName].count({ where })
    ]);

    return {
      data,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit)
      }
    };
  }

  /**
   * 查找单个记录
   * @param {Object} where - 查询条件
   * @param {Object} include - 关联查询
   * @returns {Promise<Object|null>}
   */
  async findOne(where, options = undefined) {
    const query = { where };
    if (options?.include) {
      query.include = options.include;
    }
    return this.prisma[this.modelName].findFirst(query);
  }

  /**
   * 查找多个记录
   * @param {Object} where - 查询条件
   * @param {Object} orderBy - 排序条件
   * @param {number} limit - 限制数量
   * @param {Object} include - 关联查询
   * @returns {Promise<Array>}
   */
  async findMany(where = {}, orderBy = { id: 'desc' }, limit = undefined, include = undefined) {
    const options = {
      where,
      orderBy,
      include
    };

    if (limit) {
      options.take = limit;
    }

    return this.prisma[this.modelName].findMany(options);
  }

  /**
   * 创建记录
   * @param {Object} data - 创建数据
   * @returns {Promise<Object>}
   */
  async create(data) {
    return this.prisma[this.modelName].create({
      data
    });
  }

  /**
   * 更新记录
   * @param {number|Object} where - 查询条件或ID
   * @param {Object} data - 更新数据
   * @returns {Promise<Object>}
   */
  async update(where, data) {
    const condition = typeof where === 'number' ? { id: where } : where;

    return this.prisma[this.modelName].update({
      where: condition,
      data
    });
  }

  /**
   * 删除记录
   * @param {number|Object} where - 查询条件或ID
   * @returns {Promise<Object>}
   */
  async delete(where) {
    const condition = typeof where === 'number' ? { id: where } : where;

    return this.prisma[this.modelName].delete({
      where: condition
    });
  }

  /**
   * 软删除记录（需要模型有deletedAt字段）
   * @param {number|Object} where - 查询条件或ID
   * @returns {Promise<Object>}
   */
  async softDelete(where) {
    const condition = typeof where === 'number' ? { id: where } : where;

    return this.prisma[this.modelName].update({
      where: condition,
      data: { deletedAt: new Date() }
    });
  }

  /**
   * 统计数量
   * @param {Object} where - 查询条件
   * @returns {Promise<number>}
   */
  async count(where = {}) {
    return this.prisma[this.modelName].count({ where });
  }

  /**
   * 检查记录是否存在
   * @param {Object} where - 查询条件
   * @returns {Promise<boolean>}
   */
  async exists(where) {
    const count = await this.prisma[this.modelName].count({ where });
    return count > 0;
  }

  /**
   * 批量创建记录
   * @param {Array} data - 创建数据数组
   * @returns {Promise<Array>}
   */
  async createMany(data) {
    return this.prisma[this.modelName].createMany({
      data,
      skipDuplicates: true
    });
  }

  /**
   * 批量更新记录
   * @param {Object} where - 查询条件
   * @param {Object} data - 更新数据
   * @returns {Promise<Object>}
   */
  async updateMany(where, data) {
    return this.prisma[this.modelName].updateMany({
      where,
      data
    });
  }

  /**
   * 批量删除记录
   * @param {Object} where - 查询条件
   * @returns {Promise<Object>}
   */
  async deleteMany(where) {
    return this.prisma[this.modelName].deleteMany({
      where
    });
  }

  /**
   * 连接数据库
   */
  async connect() {
    await this.prisma.$connect();
  }

  /**
   * 断开数据库连接
   */
  async disconnect() {
    await this.prisma.$disconnect();
  }
}