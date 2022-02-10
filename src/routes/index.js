const controllers = require('../controllers')
// const url = require('url')

module.exports = (app) => {
  // Check JWT token before
  
  app.use(function (req, res, next) {
    // Website you wish to allow to connect
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Access-Control-Allow-Credentials', 'true')
    res.setHeader('Access-Control-Allow-Methods', 'GET,HEAD,OPTIONS,POST,PUT,DELETE')
    res.setHeader(
      'Access-Control-Allow-Headers',
      'Access-Control-Allow-Headers, Origin, Accept, X-Requested-With, Content-Type, Access-Control-Request-Method,   Access-Control-Request-Headers, Authorization'
    )
    // next();
    // const path = url.parse(req.url).pathname
    return next();
  })

  app.get('/api', (req, res) => res.status(200).send({
    message: 'Welcome to the Todos API!'
  }))

  app.post('/api/scrapeData', controllers.scrape.scrape)
  app.post('/api/addCategories', controllers.scrape.addCategories)
  app.get('/api/categories', controllers.scrape.getCategories)
  app.post('/api/cards', controllers.scrape.getCards)
  app.post('/api/cards/remove', controllers.scrape.removeCard)
  app.get('/api/cards/card', controllers.scrape.getCardByID)
  app.post('/api/cards/update', controllers.scrape.updateCardByID)
}