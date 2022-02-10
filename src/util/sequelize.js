const Sequelize = require('sequelize')

require('dotenv').config()

const sequelize = new Sequelize(process.env.MYSQL_DATABASE, process.env.MYSQL_USER, process.env.MYSQL_PWD, {
  host: process.env.MYSQL_HOST,
  dialect: 'mysql',
  logging: false,
  pool: {
    max: 40,
    min: 0,
    acquire: 30000,
    idle: 10000
  }
})

module.exports = {
  sequelize
}
