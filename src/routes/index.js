import adminRouter from '#routes/admin/index.js';
import userRouter from '#routes/user/index.js';
import sellerRouter from '#routes/seller/index.js';
import systemRouter from '#routes/system/index.js';
import todoRouter from '#routes/todo/index.js';

import express from 'express';
const router = express.Router({ mergeParams: true });

router.use('/market', adminRouter);
router.use('/market', userRouter);
router.use('/market', sellerRouter);
router.use('/market', systemRouter);
router.use('/todo', todoRouter);
export default router;