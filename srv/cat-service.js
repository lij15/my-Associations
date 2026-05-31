const cds = require('@sap/cds')

module.exports = class CatalogService extends cds.ApplicationService {
    async init(){
        const {Books,Authors,Chapters} = this.entities

        this.before('READ',Books,books => {
            console.log('before read books')
        })

        this.after('READ',Books,books => {
            console.log('after read books')
            if(!books) return
            const list = Array.isArray(books) ? books : [books]
            for(const book of list) {
                if(book.author) {
                    book.authorName = book.author.name
                    book.authorCountry = book.author.country
                }
            }
        })

        this.before('CREATE',Books,async req => {
            console.log('CREATE BOOK CONTAIN CHAPTERS',JSON.stringify(req.data,null,2))
        })

        this.on('READ',Authors,async (req,next) => {
            const result = await next();
            //console.log('Number of authors',Array.isArray(result) ? result.length : 1)
            console.log('READ AUTHORS',JSON.stringify(result,null,2))
            return result
        })

        return super.init()
    }
}