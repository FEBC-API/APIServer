import _ from 'lodash';

import logger from '#utils/logger.js';
import { getDb } from '#utils/dbUtil.js';
const sellerOrderModel = {
  // 판매자에게 주문한 모든 주문 목록 조회
  async findBy(clientId, { seller_id, search, sortBy, page = 1, limit = 0 }) {
    logger.trace(arguments);
    const query = { ...search, products: { $elemMatch: { seller_id } } };
    logger.log(query);

    const skip = (page - 1) * limit;

    const db = await getDb(clientId); // clientId를 사용하여 DB 가져오기
    const totalCount = await db.collection('order').countDocuments(query);

    let list = await db.collection('order').aggregate([
      { $match: query },
      {
        $lookup: {
          from: 'user',
          localField: 'user_id',
          foreignField: '_id',
          as: 'user'
        }
      },
      { 
        $unwind: {
          path: '$user',
          preserveNullAndEmptyArrays: true
        }
      },
      {
        $project: {
          'user.password': 0,
          'user.address': 0,
          'user.type': 0,
          'user.createdAt': 0,
          'user.updatedAt': 0,
          'user.refreshToken': 0
        }
      }
    ]).sort(sortBy).skip(skip);

    // aggregate()에서는 limit(0) 안됨
    if (limit > 0) {
      list = list.limit(limit);
    }
    list = await list.toArray();

    // const list = await db.collection('order').find({ products: { $elemMatch: { seller_id } } }).sort(sortBy).toArray();
    list.forEach(order => {
      order.products = order.products.filter(product => product.seller_id === seller_id);
    });

    const result = { item: list };
    result.pagination = {
      page,
      limit,
      total: totalCount,
      totalPages: (limit === 0) ? 1 : Math.ceil(totalCount / limit)
    };
    
    logger.debug(list.length);
    return result;
  },

  // 지정한 상품의 모든 주문 목록 조회
  async findByProductId(clientId, product_id, seller_id) {
    logger.trace(arguments);
    const sortBy = { _id: -1 };
    const db = await getDb(clientId); // clientId를 사용하여 DB 가져오기
    const list = await db.collection('order').aggregate([
      { $match: { products: { $elemMatch: { _id: product_id, seller_id } } } },
      {
        $lookup: {
          from: 'user',
          localField: 'user_id',
          foreignField: '_id',
          as: 'user'
        }
      },
      { 
        $unwind: {
          path: '$user',
          preserveNullAndEmptyArrays: true
        }
      },
      {
        $project: {
          'user.password': 0,
          'user.address': 0,
          'user.type': 0,
          'user.createdAt': 0,
          'user.updatedAt': 0
        }
      }
    ]).sort(sortBy).toArray();
    // const list = await db.collection('order').find({ products: { $elemMatch: { _id: product_id, seller_id } } }).sort(sortBy).toArray();
    logger.debug(list);
    return list;
  },

  // 주문 내역 상세 조회(판매자의 제품이 포함된 경우에만 조회 가능)
  async findById(clientId, _id, seller_id) {
    logger.trace(arguments);
    const db = await getDb(clientId); // clientId를 사용하여 DB 가져오기

    const item = await db.collection('order').aggregate([
      { 
        $match: { 
          _id,
          products: { $elemMatch: { seller_id } } 
        }
      },
      {
        $lookup: {
          from: 'user',
          localField: 'user_id',
          foreignField: '_id',
          as: 'user'
        }
      },
      { 
        $unwind: {
          path: '$user',
          preserveNullAndEmptyArrays: true
        }
      },
      {
        $project: {
          'user.password': 0,
          'user.address': 0,
          'user.type': 0,
          'user.createdAt': 0,
          'user.updatedAt': 0,
          'user.refreshToken': 0
        }
      }
    ]).next();

    // const item = await db.collection('order').findOne({ _id, products: { $elemMatch: { seller_id } } });
    logger.debug(item);
    return item;
  }
};

export default sellerOrderModel;