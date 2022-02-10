const fs = require('fs'); 
const request = require('request-promise');
const cheerio = require('cheerio');
const { sequelize } = require('./../util/sequelize')

const shopping_types = ["", "Cashback Card", "Gift Card", "", "", "Online Shopping", "", "", "", "", "", "", "", "eVoucher"];
module.exports = {
  async getCategories (req,res) {
    try {
      let bindValues = [""];
      let queryString = 'SELECT * FROM cb_categories where `parent_id` = $1';
      let categoryList = await sequelize.query(queryString, { bind: bindValues, type: sequelize.QueryTypes.SELECT });
      let categories = await Promise.all(
        categoryList.map (async category => {
          bindValues = [category.category_id];
          queryString = 'SELECT * FROM cb_categories where `parent_id` = $1';
          let subCategories = await sequelize.query(queryString, { bind: bindValues, type: sequelize.QueryTypes.SELECT });
          return {
            category_id: category.category_id,
            category_label: category.category_label,
            subCategories: subCategories
          };
        })
      )
      console.log(categories)
      return res.status(200).json(categories);
    } catch (err) {
      return res.status(400).json(err.message);
    }
  },
  async addCategories (req,res) {
    try {
      let options = {
        method: 'GET', 
        uri: 'https://www.cashbackworld.com/it/search/categoriesfilter',
        headers: {
          'Content-Type': 'application/json',
          'X-Requested-With': 'XMLHttpRequest'
        }
      }
      let categories = await request(options);
      let bindValues = [];
      let queryString = "";
      await Promise.all(
        JSON.parse(categories).map (async category => {
          bindValues = [category.id, category.label, ""];
          queryString = 'INSERT IGNORE INTO cb_categories (`category_id`, `category_label`, `parent_id`) VALUES ($1, $2, $3)';
          await sequelize.query(queryString, { bind: bindValues, type: sequelize.QueryTypes.INSERT });
          await Promise.all(
            category.subCategories.map(async subcategory => {
              bindValues = [subcategory.id, subcategory.label, category.id];
              queryString = 'INSERT IGNORE INTO cb_categories (`category_id`, `category_label`, `parent_id`) VALUES ($1, $2, $3)';
              await sequelize.query(queryString, { bind: bindValues, type: sequelize.QueryTypes.INSERT });
              return true
            })
          )
          return category
        })
      )
      return res.status(200).json(JSON.parse(categories));
    } catch (err) {
      return res.status(400).json(err);
    }
  },

  async scrape (req, res) {
    let cashbackTypes = req.body.shopping_type ? req.body.shopping_type : [1];
    let options = {
      method: 'POST',
      uri: 'https://cube-web.cashbackworld.com/search/partners',
      body: {
        area: 0,
        cashbackTypes: cashbackTypes,
        category: req.body.subcategoryID ? req.body.subcategoryID: null,
        cooperationType: "",
        countryId: "IT",
        extrasFilters: [],
        languageId: "it-IT",
        page: req.body.page,
        pageSize: req.body.pageSize,
        searchText: req.body.searchText ? req.body.searchText : "",
        sortBy: 0,
        tenant: "Cbw"
      },
      json: true
    };
    let partnersData = await request(options);
    let { total, totalPages, documents} = partnersData;

    let scrapeRes = await Promise.all(
      documents.map (async partner => {
        let getOption = {
          method: 'GET',
          uri: "",
          headers: {
            'X-Requested-With': 'XMLHttpRequest'
          }
        };
        let urls = [
          "https://www.cashbackworld.com/it/cashback/it-it/" + partner.id,
          "https://www.cashbackworld.com/it/partner/ratings/" + partner.id
        ]
        let cardDetails = {
          channel_id: 1,
          category_id: req.body.subcategoryID,
          card_id: partner.id,
          name: "", 
          logo: "", 
          reward_cashback: "", 
          reward_sp: "", 
          shopping_type: "Cashback Card",
          description: "",
          btn_loyal_customer: false,
          open_hours: "",
          contact_info: "",
          contact_phone: "",
          contact_address: "",
          contact_web_social: [],
          contact_web_url: urls[0],
          piva_vat: "",
          id_cbw: "",
          total_review: "",
          review_score: "",
          review_stars: [],
          download_urls: "",
          banner_urls: "",
          card_pickup: false,
          delivery_service: false
        };
        try {
          let scrapeHtml = await Promise.all(urls.map(async url => {
            getOption.uri = url;
            const resHtml = await request(getOption);
            return resHtml;
          }))
          
          scrapeHtml = scrapeHtml.join();
          var $ = cheerio.load(scrapeHtml);
          cardDetails.name = $('.dealer-name .container h2').text();
          cardDetails.logo = $('.dealer-logo-wrapper img').attr('src');
          cardDetails.reward_cashback = partner.benefit ? partner.benefit.cashback : "";
          cardDetails.reward_sp = partner.benefit ? partner.benefit.shoppingPoints : "";
          cardDetails.shopping_type = shopping_types[cashbackTypes[0]];
          cardDetails.description = $('#description-container').text().replace(/  /gi, "").replace(/\n/gi, " ");
          if ($('#btnOpenRegularCustomerModal').text()) {
            cardDetails.btn_loyal_customer = true;
          }
          cardDetails.open_hours = $('#business-hours-table td').text().replace(/  /gi, "").replace(/\n/gi, " ");
          cardDetails.contact_info = $(".icon-contact div:nth-child(2)").text().replace(/  /gi, "").replace(/\n/gi, " ");
          cardDetails.contact_address = $(".icon-map div:nth-child(2)").text().replace(/  /gi, "");
          $(".icon-social-media div a").each(function(i, item) {
            cardDetails.contact_web_social.push($(this).attr('href'));
          })
          cardDetails.piva_vat = $(".icon-id div:nth-child(2)").text().replace(/\n/gi, "").replace(/  /gi, "").split(" - ")[1];
          cardDetails.id_cbw = $(".icon-id div:nth-child(2)").text().replace(/\n/gi, "").replace(/  /gi, "").split(" - ")[0];
          cardDetails.total_review = $('.stars-summary-wrapper p').text();
          cardDetails.review_score = $('.rating-bubble').text();
          $(".histogram .bar-val").each(function(i, item){
            cardDetails.review_stars.push($(this).text());
          });
          // $('script').each(function(i, item){
          //   if (i == 12) {
          //     const jsText = $(this).html();
          //     const matchX = JSON.stringify(jsText).match(/ajaxDownloadsUrl:(.*)',/);
          //     cardDetails.download_urls = "https://cashbackworld.com" + matchX[0].split(',')[0].split(/'/)[1];
          //   }
          // })
          // console.log($('script')[0].html()); 
          cardDetails.card_pickup = $('.icon-pickup').text()?true:false;
          cardDetails.delivery_service = $('.icon-truck').text()?true:false;

          let bindValues = [cardDetails.channel_id, cardDetails.category_id, cardDetails.card_id, cardDetails.name, cardDetails.logo, cardDetails.reward_cashback, cardDetails.reward_sp, cardDetails.shopping_type, cardDetails.description, cardDetails.btn_loyal_customer, cardDetails.open_hours, cardDetails.contact_info, cardDetails.contact_phone, cardDetails.contact_address, cardDetails.contact_web_social.join(","), cardDetails.contact_web_url, cardDetails.piva_vat, cardDetails.id_cbw, cardDetails.total_review, cardDetails.review_score, cardDetails.review_stars.join(","), cardDetails.download_urls, cardDetails.banner_urls, cardDetails.card_pickup, cardDetails.delivery_service];
          let queryString = 'INSERT IGNORE INTO cb_scrape_details (`channel_id`, `category_id`, `card_id`, `name`, `logo`, `reward_cashback`, `reward_sp`, `shopping_type`, `description`, `btn_loyal_customer`, `open_hours`, `contact_info`, `contact_phone`, `contact_address`, `contact_web_social`, `contact_web_url`, `piva_vat`, `id_cbw`, `total_review`, `review_score`, `review_stars`, `download_urls`, `banner_urls`, `card_pickup`, `delivery_service`) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25)';
          await sequelize.query(queryString, { bind: bindValues, type: sequelize.QueryTypes.INSERT });
          return cardDetails;
        } catch (error){
          console.log("eeeeeeeee", error.message)
          return error.message;
        }
      })
    )
    return res.status(200).json({
      total: total,
      totalPages: totalPages,
      data: scrapeRes
    });
  },

  async getCards (req, res) {
    let conditions = {};
    let filter = "";
    if (req.body.conditions && req.body.conditions.filter) {
      filter = req.body.conditions.filter;
    }
    const start = req.body.start ? req.body.start : 0;
    const numPerPage = req.body.numPerPage ? req.body.numPerPage : 10;
    const sortBy = req.body.sortBy ? req.body.sortBy : 'sd.id';
    const desc = req.body.descending ? 'DESC' : 'ASC'
    let bindValues = [];
    let queryString = '';
    let countqueryString = '';
    if (filter) {
      bindValues = ["%" + filter + "%", start, numPerPage, sortBy, desc];
      queryString = 'SELECT ch.type_channel, ch.sub_channel, ch.channel, ch.nation, cat.category_id, cat.category_label, sd.* FROM cb_scrape_details AS sd LEFT JOIN cb_channel AS ch ON sd.channel_id = ch.id LEFT JOIN cb_categories AS cat ON sd.category_id = cat.category_id WHERE sd.name LIKE $1 or cat.category_label LIKE $1 ORDER BY $4 ' + desc +' LIMIT $2, $3';
      countqueryString = 'SELECT count(*) as total FROM cb_scrape_details AS sd LEFT JOIN cb_channel AS ch ON sd.channel_id = ch.id LEFT JOIN cb_categories AS cat ON sd.category_id = cat.category_id WHERE sd.name LIKE $1 or cat.category_label LIKE $1';
    } else {
      bindValues = [start, numPerPage, sortBy, desc];
      queryString = 'SELECT ch.type_channel, ch.sub_channel, ch.channel, ch.nation, cat.category_id, cat.category_label, sd.* FROM cb_scrape_details AS sd LEFT JOIN cb_channel AS ch ON sd.channel_id = ch.id LEFT JOIN cb_categories AS cat ON sd.category_id = cat.category_id ORDER BY $3 ' + desc + ' LIMIT $1, $2';
      countqueryString = 'SELECT count(*) as total FROM cb_scrape_details AS sd LEFT JOIN cb_channel AS ch ON sd.channel_id = ch.id LEFT JOIN cb_categories AS cat ON sd.category_id = cat.category_id ';
    }
    try {
      const totalCount = await sequelize.query(countqueryString, { bind: bindValues, type: sequelize.QueryTypes.SELECT });
      const cards = await sequelize.query(queryString, { bind: bindValues, type: sequelize.QueryTypes.SELECT });
      return res.status(200).json({
        data: cards,
        totalCount: totalCount[0].total
      })
    } catch (err) {
      return res.status(400).json(err.message)
    }
  },
  async removeCard (req, res) {
    const cardID = req.body.conditions.id
    try {
      let bindValues = [cardID];
      let queryString = 'DELETE FROM cb_scrape_details WHERE id = $1';
      await sequelize.query(queryString, { bind: bindValues, type: sequelize.QueryTypes.DELETE})
      return res.status(200).json({
        data: "successfuly removed"
      });
    } catch (err) {
      return res.status(400).json(err.message);
    }
  },
  async getCardByID (req, res) {
    const cardID = req.query.id;
    try {
      let bindValues = [cardID];
      let queryString = 'SELECT ch.type_channel, ch.sub_channel, ch.channel, ch.nation, cat.category_id, cat.category_label, sd.* FROM cb_scrape_details AS sd LEFT JOIN cb_channel AS ch ON sd.channel_id = ch.id LEFT JOIN cb_categories AS cat ON sd.category_id = cat.category_id WHERE sd.id = $1';
      let cardDetail = await sequelize.query(queryString, { bind: bindValues, type: sequelize.QueryTypes.SELECT})
      return res.status(200).json({
        data: cardDetail[0]
      });
    } catch (err) {
      return res.status(400).json(err.message);
    }
  },
  async updateCardByID (req, res) {
    const cardDetails = req.body.data
    const cardID = req.body.conditions.id
    let bindValues = [cardDetails.card_id, cardDetails.name, cardDetails.logo, cardDetails.reward_cashback, cardDetails.reward_sp, cardDetails.shopping_type, cardDetails.description, cardDetails.open_hours, cardDetails.contact_info, cardDetails.contact_mail, cardDetails.contact_phone, cardDetails.contact_fax, cardDetails.contact_address, cardDetails.contact_city, cardDetails.contact_region, cardDetails.contact_street, cardDetails.contact_code, cardDetails.contact_web_social, cardDetails.contact_web_url, cardDetails.piva_vat, cardDetails.id_cbw, cardDetails.btn_loyal_customer, cardDetails.card_pickup, cardDetails.delivery_service, cardID];
    let queryString = 'UPDATE cb_scrape_details SET card_id = $1, name=$2, logo=$3, reward_cashback=$4, reward_sp=$5, shopping_type=$6, description=$7, open_hours=$8, contact_info=$9, contact_mail=$10, contact_phone=$11, contact_fax=$12, contact_address=$13, contact_city=$14, contact_region=$15, contact_street=$16, contact_code=$17, contact_web_social=$18, contact_web_url=$19, piva_vat=$20, id_cbw=$21 WHERE id = $25';
    try {
      await sequelize.query(queryString, { bind: bindValues, type: sequelize.QueryTypes.UPDATE})
      return res.status(200).json({
        message: 'Successfully Updated!'
      })
    } catch (err) {
      return res.status(400).json({
        message: err.message
      })
    }
  }
}