const express = require('express');
const router = express.Router();
const store = require('../lib/store');
const { render } = require('../lib/render');

router.get('/', async (req, res, next) => {
  try {
    const [content, services, aboutFeatures, whyUs, process, gallery] = await Promise.all([
      store.getContent(),
      store.listServices({ activeOnly: true }),
      store.listBlocks('about_features'),
      store.listBlocks('why_us'),
      store.listBlocks('process'),
      store.listGallery()
    ]);
    res.send(render('index', { content, services, aboutFeatures, whyUs, process, gallery }));
  } catch (err) {
    next(err);
  }
});

module.exports = router;
