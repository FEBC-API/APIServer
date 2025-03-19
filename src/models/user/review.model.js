import moment from 'moment-timezone';

import logger from '#utils/logger.js';
import { getDb } from '#utils/dbUtil.js';
import orderModel from '#models/user/order.model.js';


const reviewModel = {
  // 후기 등록
  async create(clientId, reviewInfo) {
    logger.trace(arguments);
    const db = await getDb(clientId);
    reviewInfo._id = await db.nextSeq('review');
    reviewInfo.createdAt = moment().tz('Asia/Seoul').format('YYYY.MM.DD HH:mm:ss');

    if (!reviewInfo.dryRun) {
      await db.collection('review').insertOne(reviewInfo);
      await orderModel.updateReviewId(clientId, reviewInfo.order_id, reviewInfo.product_id, reviewInfo._id);
    }
    return reviewInfo;
  },

  // 조건에 맞는 후기 목록 조회
  async findBy(clientId, query = {}, sortBy) {
    logger.trace(arguments);
    const db = await getDb(clientId);

    const pipeline = [
      { $match: query },
      {
        $lookup: {
          from: 'product',
          localField: 'product_id',
          foreignField: '_id',
          as: 'product'
        }
      },
      { $unwind: '$product' },
      {
        $lookup: {
          from: 'user',
          localField: 'user._id',
          foreignField: '_id',
          as: 'user'
        }
      },
      { $unwind: '$user' },
      {
        $project: {
          _id: 1,
          rating: 1,
          content: 1,
          createdAt: 1,
          extra: 1,
          'product._id': '$product._id',
          'product.image': { $arrayElemAt: ['$product.mainImages', 0] },
          'product.name': '$product.name',
          'user._id': '$user._id',
          'user.image': '$user.image',
          'user.name': {
            $concat: [
              { $substrCP: ['$user.name', 0, 1] }, // 첫 번째 문자 추출
              {
                $reduce: {
                  input: { $range: [1, { $strLenCP: '$user.name' }] }, // 첫 문자 이후의 길이 범위
                  initialValue: '',
                  in: {
                    $concat: ['$$value', '*'] // 나머지 문자 '*'로 대체
                  }
                }
              }
            ]
          }
        }
      }
    ];

    if (sortBy) {
      pipeline.push({ $sort: sortBy });
    }

    let list = await db.collection('review').aggregate(pipeline).toArray();

    logger.debug(list);
    return list;
  },

  // 후기만 조회
  async findById(clientId, _id) {
    logger.trace(arguments);
    const db = await getDb(clientId);

    const item = await db.collection('review').findOne({ _id });
    logger.debug(item);
    return item;
  },

  // 후기 수정
  async update(clientId, _id, review) {
    logger.trace(arguments);
    const db = await getDb(clientId);
    review.updatedAt = moment().tz('Asia/Seoul').format('YYYY.MM.DD HH:mm:ss');
    if (!review.dryRun) {
      await db.collection('review').updateOne(
        { _id },
        { $set: review }
      );
    }
    return { _id, ...review };
  },

  // 후기 삭제
  async delete(clientId, _id) {
    logger.trace(arguments);
    const db = await getDb(clientId);

    const result = await db.collection('review').deleteOne({ _id });
    logger.debug(result);
    return result;
  },

  // 판매자 후기 목록 조회
  async findBySeller(clientId, seller_id) {
    logger.trace(arguments);
    const db = await getDb(clientId);

    const list = await db.collection('product').aggregate([
      { $match: { seller_id } },
      {
        $lookup: {
          from: 'review',
          localField: '_id',
          foreignField: 'product_id',
          as: 'review'
        }
      },
      { $unwind: '$review' },
      {
        $lookup: {
          from: 'user',
          localField: 'review.user_id',
          foreignField: '_id',
          as: 'user'
        }
      },
      { $unwind: '$user' },
      {
        $project: {
          product_id: '$_id',
          price: 1,
          name: 1,
          'image': { $arrayElemAt: ['$mainImages', 0] },
          'review._id': '$review._id',
          'review.extra': '$review.extra',
          'review.rating': '$review.rating',
          'review.content': '$review.content',
          'review.createdAt': '$review.createdAt',
          'review.user._id': '$user._id',
          'review.user.image': '$user.image',
          'review.user.name': {
            $concat: [
              { $substrCP: ['$user.name', 0, 1] }, // 첫 번째 문자 추출
              {
                $reduce: {
                  input: { $range: [1, { $strLenCP: '$user.name' }] }, // 첫 문자 이후의 길이 범위
                  initialValue: '',
                  in: {
                    $concat: ['$$value', '*'] // 나머지 문자 '*'로 대체
                  }
                }
              }
            ]
          },
        }
      },
      {
        $group: {
          _id: '$_id',
          product_id: { $first: '$product_id' },
          price: { $first: '$price' },
          name: { $first: '$name' },
          image: { $first: '$image' },
          replies: { $push: '$review' }
        }
      }
    ]).sort({ _id: -1 }).toArray();

    logger.debug(list);
    return list;
  }
}

export default reviewModel;