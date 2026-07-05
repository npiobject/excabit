class Canvas  {
    constructor(){

        this.dimCanvas       = dimCanvas;
        this.margenCanvas    = margenCanvas; 
        this.dimCanvas_0     = dimCanvas_0;       
    }//fin constructor


    putCanvas(){

        canvas = createCanvas(  windowWidth  - this.margenCanvas.der, 
                                windowHeight - this.margenCanvas.pie );
        canvas.position(this.margenCanvas.izq, this.margenCanvas.cabe);   

        background(222);
        
        this.dimCanvas.alto    = height - this.margenCanvas.cabe - this.margenCanvas.pie;
        this.dimCanvas.ancho   = width  - this.margenCanvas.izq  - this.margenCanvas.der;
        this.dimCanvas.x       = this.margenCanvas.izq;
        this.dimCanvas.y       = this.margenCanvas.cabe;
        this.dimCanvas.xCentro = int((this.dimCanvas.ancho / 2) + this.margenCanvas.izq ) ;
        this.dimCanvas.yCentro = int((this.dimCanvas.alto  / 2) + this.margenCanvas.cabe) ;

        return this.dimCanvas;
    
    }//fin putCanvas()

    putCanvas_0(){

        canvas = createCanvas(  windowWidth   ,  windowHeight   );
        canvas.position(0,0); 

        //Poner el fonde de imagen b2p5
        image(imagenBg, 0,0, windowWidth   ,  windowHeight );


        //this.dimCanvas         = dimCanvas;
        
        this.dimCanvas.alto    = height  ;
        this.dimCanvas.ancho   = width   ;
        this.dimCanvas.x       = 0;
        this.dimCanvas.y       = 0;
        this.dimCanvas.xCentro = int(this.dimCanvas.ancho / 2) ;
        this.dimCanvas.yCentro = int(this.dimCanvas.alto  / 2) ;

        return this.dimCanvas;
    
    }//fin putCanvas_0()

}// fin de class Canvas  