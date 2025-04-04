import _ from 'lodash';

import logger from '#utils/logger.js';
import { getDb } from '#utils/dbUtil.js';
import userModel from '#models/user/user.model.js';
import codeModel from '#models/system/code.model.js';
import configModel from '#models/system/config.model.js';

const priceUtil = {
  async getCost(clientId, { user_id, products, clientDiscount = { products: 0, shippingFees: 0 } }){
    const db = await getDb(clientId);

    const sellerBaseShippingFees = {};
    const productArray = _.map(products, '_id');
    const dbProducts = await db.collection('product').find({ _id: { $in: productArray } }).toArray();
    const shippingFees = (await configModel.findById(clientId, 'shippingFees'))?.value;

    dbProducts.forEach((product) => {
      const beforeShippingFees = sellerBaseShippingFees[product.seller_id];
      product.price = product.price * _.find(products, {_id: product._id}).quantity;
      if(beforeShippingFees === undefined){
        // sellerBaseShippingFees[product.seller_id] = product.shippingFees === undefined ? global[clientId].config.shippingFees?.value : product.shippingFees;
        sellerBaseShippingFees[product.seller_id] = product.shippingFees === undefined ? shippingFees : product.shippingFees;
      }else{
        // sellerBaseShippingFees[product.seller_id] = Math.max(beforeShippingFees, product.shippingFees === undefined ? global[clientId].config.shippingFees?.value : product.shippingFees);
        sellerBaseShippingFees[product.seller_id] = Math.max(beforeShippingFees, product.shippingFees === undefined ? shippingFees : product.shippingFees);
      }
    });

    // 할인 전 금액
    const cost = {
      products: _.sumBy(dbProducts, 'price'),
      shippingFees: _.sum(Object.values(sellerBaseShippingFees)) || 0, // config.shippingFees와 상품의 shippingFees가 없는 경우 0원으로 지정
    };

    // 회원 등급별 할인율
    const totalDiscount = clientDiscount; // 상품 할인 쿠폰, 배송비 쿠폰 처럼 주문 정보에 포함된 할인 금액
    if(user_id){
      // 회원 등급
      const membershipClass = await userModel.findAttrById(clientId, user_id, 'extra.membershipClass');
      // 회원 등급별 할인율
      // const discountRate = codeUtil.getCodeAttr(clientId, membershipClass?.extra?.membershipClass, 'discountRate');
      const discountCode = await codeModel.findByCode(clientId, membershipClass?.extra?.membershipClass);

      if(discountCode != undefined){
        totalDiscount.products = clientDiscount.products + Math.ceil((cost.products - clientDiscount.products) * (discountCode.discountRate/100) /10) * 10;
      }
    }

    const result = {
      ...cost,
      discount: totalDiscount,
      total: cost.products - totalDiscount.products
    };

    // 무료 배송 확인
    const freeShippingFees = (await configModel.findById(clientId, 'freeShippingFees'))?.value;
    if(result.total >= freeShippingFees){
      result.discount.shippingFees = cost.shippingFees;
    }

    result.total += cost.shippingFees - result.discount.shippingFees;
    logger.debug(result);
    return result;
  }
};

export default priceUtil;