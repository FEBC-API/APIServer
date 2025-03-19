import moment from 'moment-timezone';

import logger from '#utils/logger.js';
import { getDb } from '#utils/dbUtil.js';

const bookmarkModel = {
  // 북마크 등록
  async create(clientId, bookmark) {
    logger.trace(arguments);
    const db = await getDb(clientId);
    bookmark._id = await db.nextSeq('bookmark');
    bookmark.createdAt = moment().tz('Asia/Seoul').format('YYYY.MM.DD HH:mm:ss');

    if (!bookmark.dryRun) {
      await db.collection('bookmark').insertOne(bookmark);
    }
    return bookmark;
  },

  // 북마크 목록 조회
  async findBy(clientId, query) {
    logger.trace(arguments);
    const db = await getDb(clientId);
    const list = await db.collection('bookmark').aggregate([
      { $match: query },
      {
        $lookup: {
          from: query.type, // product|post|user
          localField: `target_id`, // bookmark.target_id
          foreignField: '_id', // (product|post|user)._id
          as: query.type
        }
      },
      { $unwind: `$${query.type}` }, // 원본이 삭제된 경우 조회되지 않음
      // {
      //   $unwind: { // 원본이 삭제된 경우에도 원본 정보는 빈 객체로 조회됨
      //     path: `$${query.type}`,
      //     preserveNullAndEmptyArrays: true
      //   }
      // },
      {
        $project: {
          // bookmark
          _id: 1,
          memo: 1,
          extra: 1,
          createdAt: 1,

          // product, user, post 공통
          [`${query.type}._id`]: `$${query.type}._id`,
          // [`${query.type}.extra`]: `$${query.type}.extra`,

          // product, user
          [`${query.type}.name`]: `$${query.type}.name`,

          // product
          [`${query.type}.price`]: `$${query.type}.price`,
          [`${query.type}.quantity`]: `$${query.type}.quantity`,
          [`${query.type}.buyQuantity`]: `$${query.type}.buyQuantity`,
          [`${query.type}.mainImages`]: `$${query.type}.mainImages`,
          [`${query.type}.extra`]: `$${query.type}.extra`,

          // user
          [`${query.type}.email`]: `$${query.type}.email`,
          [`${query.type}.image`]: `$${query.type}.image`,

          // post
          [`${query.type}.type`]: `$${query.type}.type`,
          [`${query.type}.title`]: `$${query.type}.title`,
          [`${query.type}.user`]: `$${query.type}.user`,
          [`${query.type}.image`]: `$${query.type}.image`,
          // [`${query.type}.product_id`]: `$${query.type}.product_id`,

        }

      }
    ]).toArray();

    logger.debug(list);
    return list;
  },

  // 지정한 사용자의 북마크 목록 조회
  async findByUser(clientId, user_id) {
    logger.trace(arguments);
    const db = await getDb(clientId);
    const bookmarkedList = await db.collection('bookmark').aggregate([
      { $match: { type: 'user', target_id: user_id } },
      {
        $project: {
          type: 0,
          user_id: 0,
          target_id: 0,
        }
      }
    ]).toArray();

    const result = {
      byUser: bookmarkedList,
      user: await this.findBy(clientId, { type: 'user', user_id }),
      product: await this.findBy(clientId, { type: 'product', user_id }),
      post: await this.findBy(clientId, { type: 'post', user_id })
    };

    logger.debug(result);
    return result;
  },

  // 상품에 대한 북마크 목록 조회
  async findByProduct(clientId, product_id) {
    logger.trace(arguments);
    const db = await getDb(clientId);
    const list = await db.collection('bookmark').find({ type: 'product', target_id: product_id }).toArray();

    logger.debug(list);
    return list;
  },

  // 지정한 검색 조건으로 북마크 한건 조회
  async findOneBy(clientId, query) {
    const result = await this.findBy(clientId, query);
    logger.debug(result[0]);
    return result[0];
  },

  // 북마크 삭제
  async delete(clientId, query) {
    logger.trace(arguments);
    const db = await getDb(clientId);
    const result = await db.collection('bookmark').deleteOne(query);
    logger.debug(result);
    return result;
  }
}

export default bookmarkModel;
