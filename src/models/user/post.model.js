import _ from 'lodash';
import moment from 'moment-timezone';

import logger from '#utils/logger.js';
import { getDb } from '#utils/dbUtil.js';
import sellerProductModel from '#models/seller/product.model.js';

const postModel = {

  // 게시글 등록
  async create(clientId, post){
    const db = await getDb(clientId);
    post.type = post.type || 'post';
    logger.trace(post);
    post._id = await db.nextSeq('post');
    post.updatedAt = post.createdAt = moment().tz('Asia/Seoul').format('YYYY.MM.DD HH:mm:ss');
    post.seller_id = (await sellerProductModel.findAttrById(clientId, { _id: post.product_id, attr: 'seller_id' }))?.seller_id
    if(!post.dryRun){
      await db.collection('post').insertOne(post);
    }
    return post;
  },

  // 게시글 목록 조회
  async find(clientId, { type='post', userId, search={}, sortBy={}, page=1, limit=0 }){
    logger.trace(arguments);
    const db = await getDb(clientId);
    
    let query = { type, ...search };
    logger.trace(query);

    const skip = (page-1) * limit;

    const totalCount = await db.collection('post').countDocuments(query);
    // const list = await this.db.post.find(query).sort(sortBy).toArray();

    const nonPrivate = {
      $or: [
        { private: { $ne: true } }, // private이 true가 아닌 문서이거나
        { private: { $exists: false } }, // private 속성이 없는 문서이거나
        { $and: [
          { private: true },  // private이 true인 문서 중
          { $or: [
            { 'user._id': userId }, // 내가 작성한 문서이거나
            { $and: [
              { share: { $exists: true }}, // share 속성이 있으면서
              { share: { $in: [userId] }}, // share 배열에 사용자 id가 포함된 문서일 경우
            ]}
          ]}
        ]}
      ]
    };

    if (query.$or) {
      const $and = [
        {$or: query.$or},
        nonPrivate
      ];
      delete query.$or;
      query = { ...query, $and };
    } else {
      query = { ...query, ...nonPrivate };
    }
    
    let list = db.collection('post').aggregate([
      { $match: query },
      {
        $lookup: {
          from: 'product',
          localField: 'product_id',
          foreignField: '_id',
          as: 'product'
        }
      },
      { 
        $unwind: {
          path: '$product',
          preserveNullAndEmptyArrays: true
        }
      },

      // 북마크 목록
      {
        $lookup: {
          from: "bookmark",
          let: { postId: "$_id" },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    { $eq: ["$target_id", "$$postId"] },
                    { $eq: ["$type", "post"] } // 게시물에 대한 북마크는 type이 post로 지정됨
                  ]
                }
              }
            }
          ],
          as: "bookmarkItems"
        }
      },
      {
        $addFields: {
          bookmarks: { $size: "$bookmarkItems" },
          myBookmarkId: { // 내가 북마크한 게시물일때 북마크 id
            $map: {
              input: {
                $filter: {
                  input: "$bookmarkItems",
                  as: "bookmark",
                  cond: { $eq: ["$$bookmark.user._id", userId] } // userId가 북마크한 항목 필터링
                }
              },
              as: "bookmark",
              in: "$$bookmark._id"
            }
          }
        }
      },

      { 
        $unwind: {
          path: "$myBookmarkId",
          preserveNullAndEmptyArrays: true
        }
      },

      {
        $project: {
          _id: 1,
          type: 1,
          product_id: 1,
          seller_id: 1,
          user: 1,
          title: 1,
          content: 1,
          image: 1,
          extra: 1,
          createdAt: 1,
          updatedAt: 1,
          views: 1,
          tag: 1,
          private: 1,
          // bookmarkItems: 1,
          myBookmarkId: 1,
          bookmarks: 1,
          repliesCount: { $cond: { if: { $isArray: '$replies' }, then: { $size: '$replies' }, else: 0 } },
          'product.name': '$product.name',
          // 'product.image': { $cond: { if: { $isArray: '$product.mainImages' }, then: { $arrayElemAt: ['$product.mainImages', 0] }, else: undefined } }
          'product.image': { $arrayElemAt: ['$product.mainImages', 0] }
        }
      }
    ]).sort(sortBy).skip(skip);

    // aggregate()에서는 limit(0) 안됨
    if(limit > 0){
      list = list.limit(limit);
    }
    list = await list.toArray();

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

  // 게시글 상세 조회
  async findById(clientId, { _id, userId, incView }){
    logger.trace(arguments);
    const db = await getDb(clientId);
    
    let item;
    if(incView){ // 상세 조회때만 조회수 증가(수정, 삭제, 댓글 목록 조회 등을 위해 호출될 경우 조회수 증가 방지)
      await db.collection('post').updateOne(
        { _id: _id },
        { $inc: { views: 1 } }
      );

      item = await db.collection('post').aggregate([
        { $match: { _id }},
        {
          $lookup: {
            from: 'product',
            localField: 'product_id',
            foreignField: '_id',
            as: 'temp_product'
          }
        },
        { 
          $unwind: {
            path: '$product',
            preserveNullAndEmptyArrays: true
          }
        },
        {
          $addFields: {
            // 'product' 필드에서 필요한 속성만 포함
            product: {
              _id: "$temp_product._id",
              name: "$temp_product.name",
              mainImages: "$temp_product.mainImages"
            }
          }
        },

        // 북마크 목록
        {
          $lookup: {
            from: "bookmark",
            let: { postId: "$_id" },
            pipeline: [
              {
                $match: {
                  $expr: {
                    $and: [
                      { $eq: ["$target_id", "$$postId"] },
                      { $eq: ["$type", "post"] } // 게시물에 대한 북마크는 type이 post로 지정됨
                    ]
                  }
                }
              }
            ],
            as: "bookmarkItems"
          }
        },
        {
          $addFields: {
            bookmarks: { $size: "$bookmarkItems" },
            myBookmarkId: { // 내가 북마크한 게시물일때 북마크 id
              $map: {
                input: {
                  $filter: {
                    input: "$bookmarkItems",
                    as: "bookmark",
                    cond: { $eq: ["$$bookmark.user._id", userId] } // userId가 북마크한 항목 필터링
                  }
                },
                as: "bookmark",
                in: "$$bookmark._id"
              }
            }
          }
        },

        { 
          $unwind: {
            path: "$myBookmarkId",
            preserveNullAndEmptyArrays: true
          }
        },

        {
          $project: {
            "temp_product": 0,
            "bookmarkItems": 0
          }
        }
      ]).next();
    }else{
      item = await db.collection('post').findOne({ _id });
    }
    
    logger.debug(item);
    return item;
  },

  // 게시글 수정
  async update(clientId, _id, post){
    logger.trace(arguments);
    const db = await getDb(clientId);
    post.updatedAt = moment().tz('Asia/Seoul').format('YYYY.MM.DD HH:mm:ss');
    if(!post.dryRun){
      await db.collection('post').updateOne(
        { _id },
        { $set: post
          // $set: {
          //   title: post.title,
          //   content: post.content,
          //   extra: post.extra,
          //   updatedAt: post.updatedAt
          // }
        }
      );
    }
    return { _id, ...post };
  },

  // 게시글 삭제
  async delete(clientId, _id){
    logger.trace(arguments);
    const db = await getDb(clientId);
    const result = await db.collection('post').deleteOne({ _id });
    logger.debug(result);
    return result;
  },

  // 댓글 목록 조회
  async findReplies(clientId, { _id, page=1, limit=0, sortBy }){
    logger.trace(arguments);
    
    const post = await this.findById(clientId, { _id });

    let list = post.replies || [];
    const totalCount = list.length;

    const sortKeys = [];
    const orders = [];
    for(const key in sortBy){
      sortKeys.push(key);
      orders.push(sortBy[key] === 1 ? 'asc' : 'desc');
    }

    list = _.orderBy(list, sortKeys, orders);

    const skip = (page-1) * limit;
    if(limit > 0){
      list = list.splice(skip, limit);
    }else{
      list = list.splice(skip);
    }    
    
    const result = { item: list };
    result.pagination = {
      page,
      limit,
      total: totalCount,
      totalPages: (limit === 0) ? 1 : Math.ceil(totalCount / limit)
    };

    logger.debug(result);
    return result;
  },

  // 댓글 등록
  async createReply(clientId, _id, reply){
    logger.trace(arguments);
    const db = await getDb(clientId);
    reply._id = await db.nextSeq('reply');
    reply.updatedAt = reply.createdAt = moment().tz('Asia/Seoul').format('YYYY.MM.DD HH:mm:ss');
    if(!reply.dryRun){
      await db.collection('post').updateOne({ _id }, { $push: { replies: reply } });
    }
    return reply;
  },

  // 댓글 수정
  async updateReply(clientId, _id, reply_id, reply){
    logger.trace(arguments);
    const db = await getDb(clientId);
    reply.updatedAt = moment().tz('Asia/Seoul').format('YYYY.MM.DD HH:mm:ss');

    const setData = {};
    for(let prop in reply){
      setData[`replies.$[elementKey].${prop}`] = reply[prop];
    }
    const result = await db.collection('post').findOneAndUpdate(
      { _id },
      { 
        $set: setData
      },
      // { 
      //   $set: { 
      //     'replies.$[elementKey].comment': reply.comment,
      //     'replies.$[elementKey].updatedAt': reply.updatedAt
      //   } 
      // },
      { 
        arrayFilters: [{ 'elementKey._id': reply_id }],
        returnDocument: 'after' // 업데이트된 문서 반환
      }
    );
    const updatedReply = result.replies.find(reply => reply._id === reply_id);
    logger.debug(updatedReply);
    return updatedReply;
  },

  // 댓글 삭제
  async deleteReply(clientId, _id, reply_id){
    logger.trace(arguments);
    const db = await getDb(clientId);
    const result = await db.collection('post').updateOne(
      { _id },
      { $pull: { replies: { _id: reply_id }} }
    );
    logger.debug(result);
    return result;
  }
};
export default postModel;

