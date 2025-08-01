import fileRouter from './files.js';
// import fileRouter from './files.gridfs.js';
import authRouter from './auth.js';
import codeRouter from './codes.js';
import configRouter from './config.js';
import mailRouter from './email.js';
import dbinitRouter from './dbinit.js';

import express from 'express';
const router = express.Router({mergeParams: true});

router.use('/files', fileRouter);
router.use('/auth', authRouter);
router.use('/codes', codeRouter);
router.use('/config', configRouter);
router.use('/email', mailRouter);
router.use('/db', dbinitRouter);

export default router;