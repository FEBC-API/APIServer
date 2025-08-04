import logger from '#utils/logger.js';
import { db as DBConfig } from '#config/index.js';
import { MongoClient } from 'mongodb';

let client;

const nextSeq = async (db, _id) => {
  let result = await db.collection('seq').findOneAndUpdate({ _id }, { $inc: { no: 1 } });
  if (!result) {
    result = { _id, no: 1 };
    await setSeq(db, _id, 2);
    // await db.collection('seq').insertOne({ _id, no: 2 });
  }
  // logger.debug('nextseq', _id, result.no)
  return result.no;
}

const setSeq = async (db, _id, no) => {
  await db.collection('seq').updateOne({ _id }, { $set: { no } }, { upsert: true });
}

export const getClientId = (req) => {
  const clientId = req?.headers?.['client-id'];
  if (!clientId) throw new Error('client-id 헤더가 없습니다.');
  if (!DBConfig.clientIds.includes(clientId)) throw new Error(`[${clientId}]는 등록되지 않은 client-id 입니다.`);
  return clientId;
};

export const getDb = async (clientId) => {
  if (!client){
    await connect();
  }

  const db = client.db(clientId);
  db.nextSeq = (_id) => nextSeq(db, _id);
  db.setSeq = (_id, no) => setSeq(db, _id, no);
  return db;
};

const connect = async () => {
  if(!client){
    logger.log(`DB 접속 시도: ${DBConfig.url}`);
    client = new MongoClient(DBConfig.url);
    await client.connect();
    logger.info(`DB 접속 성공`);
  }
};

export const disconnect = async () => {
  if(client){
    await client.close();
    logger.info('DB 연결 해제 성공');
  }
}
