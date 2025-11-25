/**
 * TodoList 전통적인 웹 애플리케이션 서버
 */

import { list, create, update, remove } from '#routes/todo/todo.model.js';
import express from 'express';
import ejs from 'ejs';
import path from 'path';
import { fileURLToPath } from 'url';

const router = express.Router();
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// 메인 페이지
router.get('/', function(req, res, next) {
  res.redirect('/todolist/list');
});

// 할일 목록 조회
router.get('/list', async function(req, res, next) {
  try{
    const todoList = await list(req.query);
    
    ////////// 큰 데이터를 가정해서 body 응답 시간을 늘림 ///////////
    const response = await ejs.renderFile(path.join(__dirname, 'index.ejs'), { todoList });
    const first = response.substring(0, response.indexOf('<body>')+7);
    const second = response.substring(response.indexOf('<body>')+7);

    res.writeHead(200, { 'Content-Type': 'text/html;charset=utf-8' });
    res.write(first);
    setTimeout(async () => {
      res.end(second);
    }, 1000);
    //////////////////////////////////////////////////////////////

    // 정상적인 응답
    // res.render('index', { todoList });
  }catch(err){
    next(err);
  }
});

// 할일 등록
router.post('/regist', function(req, res, next) {
  try{
    create(req.body);
    res.redirect('/todolist/list');
  }catch(err){
    next(err);
  }
});

// 할일 수정
router.get('/update/:_id', function(req, res, next) {
  try{
    update(Number(req.params._id), { done: JSON.parse(req.query.done) });
    res.redirect('/todolist/list');
  }catch(err){
    next(err);
  }
});

// 할일 삭제
router.post('/delete', function(req, res, next) {
  try{
    remove(Number(req.body._id));
    res.redirect('/todolist/list');
  }catch(err){
    next(err);
  }
});

// // DB 초기화
// router.get('/init', async function(req, res, next) {
//   try{
//     await model.init();
//     res.redirect('/list');
//   }catch(err){
//     next(err);
//   }
// });

export default router;
