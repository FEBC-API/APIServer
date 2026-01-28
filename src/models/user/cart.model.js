import _ from 'lodash';
import moment from 'moment-timezone';
import createError from 'http-errors';

import logger from '#utils/logger.js';
import priceUtil from '#utils/priceUtil.js';
import { getDb } from '#utils/dbUtil.js';

const cartModel = {
  // 장바구니 등록
  async create(clientId, cartInfo) {
    logger.trace(arguments);
    const db = await getDb(clientId);
    const product_id = Number(cartInfo.product_id);
    const updatedAt = moment().tz('Asia/Seoul').format('YYYY.MM.DD HH:mm:ss');

    const beforeCart = await this.findByUser(clientId, cartInfo.user_id);
    let sameProduct;
    if (cartInfo.size || cartInfo.color) {
      // size와 color가 모두 일치하는 상품 찾기
      const matchCondition = { product_id };
      if (cartInfo.size) matchCondition.size = cartInfo.size;
      if (cartInfo.color) matchCondition.color = cartInfo.color;
      sameProduct = _.find(beforeCart, matchCondition);
    } else {
      sameProduct = _.find(beforeCart, { product_id });
    }

    // 이미 등록된 상품일 경우 수량을 증가시킨다.
    if (sameProduct) {
      const quantity = sameProduct.quantity + cartInfo.quantity;
      if (!cartInfo.dryRun) {
        await db.collection('cart').updateOne({ _id: sameProduct._id }, { $set: { quantity, updatedAt } });
      }
    } else {
      cartInfo._id = await db.nextSeq('cart');
      cartInfo.updatedAt = cartInfo.createdAt = updatedAt;
      if (!cartInfo.dryRun) {
        await db.collection('cart').insertOne(cartInfo);
      }
    }
    const list = await this.findByUser(clientId, cartInfo.user_id);
    return list;
  },

  // 장바구니 목록 조회(비로그인 상태)
  async findLocalCart(clientId, { products, discount }) {
    logger.trace(arguments);
    const db = await getDb(clientId);
    const carts = {
      products: [],
      cost: {}
    };

    const productIds = _.map(products, '_id');
    const productList = await db.collection('product').aggregate([
      { $match: { _id: { $in: productIds } } },
      {
        $lookup: {
          from: 'user',
          localField: 'seller_id',
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
          _id: 1,
          seller_id: 1,
          name: 1,
          price: 1,
          quantity: 1,
          buyQuantity: 1,
          image: { $arrayElemAt: ['$mainImages', 0] },
          extra: 1,
          'seller._id': '$user._id',
          'seller.name': '$user.name',
          'seller.image': '$user.image',
        }
      }
    ]).toArray();

    for (let { _id, quantity, size, color } of products) {
      const product = _.find(productList, { _id });
      if (product) {
        carts.products.push({
          ...product,
          _id,
          quantity,
          size,
          color,
          quantityInStock: product.quantity - product.buyQuantity,
          price: product.price * quantity,
        });
      } else {
        throw createError(422, `상품번호 ${_id}인 상품이 존재하지 않습니다.`);
      }
    }

    carts.cost = await priceUtil.getCost(clientId, { products, clientDiscount: discount });

    logger.debug(carts);
    return carts;
  },

  // 장바구니 목록 조회(로그인 상태)
  async findByUser(clientId, user_id, discount) {
    logger.trace(arguments);
    // const list = await this.db.cart.find({ user_id }).sort({ createdAt: -1 }).toArray();
    const db = await getDb(clientId);

    const list = await db.collection('cart').aggregate([
      { $match: { user_id } },
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
          path: '$product'
        }
      },
      {
        $lookup: {
          from: 'user',
          localField: 'product.seller_id',
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
          _id: 1,
          product_id: 1,
          size: 1,
          color: 1,
          quantity: 1,
          createdAt: 1,
          updatedAt: 1,
          'product._id': '$product._id',
          'product.name': '$product.name',
          'product.price': '$product.price',
          'product.seller_id': '$product.seller_id',
          'product.quantity': '$product.quantity',
          'product.buyQuantity': '$product.buyQuantity',
          'product.image': { $arrayElemAt: ['$product.mainImages', 0] },
          'product.extra': '$product.extra',
          'product.seller._id': '$user._id',
          'product.seller.name': '$user.name',
          'product.seller.image': '$user.image',
        }
      }
    ]).sort({ _id: -1 }).toArray();

    list.cost = await priceUtil.getCost(clientId, { products: _.map(list, cart => ({ _id: cart.product._id, quantity: cart.quantity })), clientDiscount: discount, user_id });

    logger.debug(list);
    return list;
  },

  async findById(clientId, _id) {
    logger.trace(arguments);
    const db = await getDb(clientId);
    const item = await db.collection('cart').findOne({ _id });
    logger.debug(item);
    return item;
  },

  // 장바구니 상품 수량/옵션 수정
  async update(clientId, user_id, _id, { quantity, size, color }) {
    logger.trace(arguments);
    const db = await getDb(clientId);
    const updatedAt = moment().tz('Asia/Seoul').format('YYYY.MM.DD HH:mm:ss');

    const cart = await this.findById(clientId, _id);
    if (!cart) {
      throw createError(404, `장바구니 항목이 존재하지 않습니다.`);
    }

    // 수정하려는 정보가 기존과 같다면 아무 작업도 하지 않음
    if (quantity === cart.quantity && size === cart.size && color === cart.color) {
      return this.findByUser(clientId, user_id);
    }

    // 옵션(size, color)이 변경되는 경우, 변경 후의 조건과 일치하는 다른 장바구니 항목이 있는지 확인
    if (size !== cart.size || color !== cart.color) {
      const matchCondition = {
        user_id,
        product_id: cart.product_id,
        _id: { $ne: _id } // 자기 자신 제외
      };
      if (size !== undefined) matchCondition.size = size;
      else if (cart.size) matchCondition.size = cart.size;

      if (color !== undefined) matchCondition.color = color;
      else if (cart.color) matchCondition.color = cart.color;

      const sameProduct = await db.collection('cart').findOne(matchCondition);

      if (sameProduct) {
        // 이미 동일한 옵션의 항목이 있다면, 기존 항목은 삭제하고 수량을 합침
        const newQuantity = (quantity !== undefined ? quantity : cart.quantity) + sameProduct.quantity;
        await db.collection('cart').deleteOne({ _id });
        await db.collection('cart').updateOne({ _id: sameProduct._id }, { $set: { quantity: newQuantity, updatedAt } });
      } else {
        // 동일 항목이 없으면 현재 항목 업데이트
        const updateData = { updatedAt };
        if (quantity !== undefined) updateData.quantity = quantity;
        if (size !== undefined) updateData.size = size;
        if (color !== undefined) updateData.color = color;
        await db.collection('cart').updateOne({ _id }, { $set: updateData });
      }
    } else {
      // 수량만 변경되는 경우
      await db.collection('cart').updateOne({ _id }, { $set: { quantity, updatedAt } });
    }

    const list = await this.findByUser(clientId, user_id);
    return list;
  },

  // 장바구니 상품 한건 삭제
  async delete(clientId, user_id, _id) {
    logger.trace(arguments);
    const db = await getDb(clientId);

    await db.collection('cart').deleteOne({ _id });
    const list = await this.findByUser(clientId, user_id);
    return list;
  },

  // 장바구니 상품 여러건 삭제
  async deleteMany(clientId, user_id, cartIdList) {
    logger.trace(arguments);
    const db = await getDb(clientId);

    await db.collection('cart').deleteMany({ _id: { $in: cartIdList }, user_id });
    const list = await this.findByUser(clientId, user_id);
    return list;
  },

  // 장바구니 비우기
  async cleanup(clientId, user_id) {
    logger.trace(arguments);
    const db = await getDb(clientId);

    const result = await db.collection('cart').deleteMany({ user_id });
    logger.debug(result);
    return result;
  },

  // 장바구니 상품 합치기
  async add(clientId, user_id, products) {
    logger.trace(arguments);
    const db = await getDb(clientId);

    const updatedAt = moment().tz('Asia/Seoul').format('YYYY.MM.DD HH:mm:ss');
    const beforeCart = await this.findByUser(clientId, user_id);

    for (const product of products) {
      // size와 color가 모두 일치하는 상품 찾기
      let sameProduct;
      if (product.size || product.color) {
        const matchCondition = { product_id: product._id };
        if (product.size) matchCondition.size = product.size;
        if (product.color) matchCondition.color = product.color;
        sameProduct = _.find(beforeCart, matchCondition);
      } else {
        sameProduct = _.find(beforeCart, { product_id: product._id });
      }

      // 이미 등록된 상품일 경우 수량을 증가시킨다.
      if (sameProduct) {
        const quantity = sameProduct.quantity + product.quantity;
        if (!products.dryRun) {
          await db.collection('cart').updateOne({ _id: sameProduct._id }, { $set: { quantity, updatedAt } });
        }
      } else {
        const cart = {
          _id: await db.nextSeq('cart'),
          user_id,
          product_id: product._id,
          size: product.size,
          color: product.color,
          quantity: product.quantity,
        };
        cart.updatedAt = cart.createdAt = updatedAt;
        logger.debug(cart);
        if (!products.dryRun) {
          await db.collection('cart').insertOne(cart);
        }
      }
    }

    const list = await this.findByUser(clientId, user_id);
    return list;
  }
}

export default cartModel;