namespace my.bookshop;

entity Authors{
    key ID      :   Integer;
        name    :   String(100);
        country :   String(50);
        //to-many Association
        book    :   Association to many Books on book.author = $self;
}

entity Books {
    key ID      :   Integer;
        title   :   String(200);
        price   :   Decimal(9, 2);
        //to-one Association
        author  :   Association to Authors;
        //to-many Composition
        chapters :  Composition of many Chapters on chapters.book = $self;
}

entity Chapters{
    key ID      :   Integer;
        title   :   String(200);
        content :   String(5000);
        seq     :   Integer;
        //to-one Association
        book    :   Association to Books;
}