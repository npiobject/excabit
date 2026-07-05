class Ventana  {
  constructor(){
    //Interior
    this.x         = 0 ;
    this.y         = 0 ;
    this.ancho     = 300 ;
    this.alto      = 100 ;

    this.margen = {'arriba' : 10 , 'abajo' : 10 , 'izq' : 10 , 'dere' : 10 };

    //Exterior
    this.xExt       ;   
    this.yExt       ;  
    this.anchoExt   ; 
    this.altoExt    ;

    //Brillo
    this.brillo                 = 50;
    this.tranparenciaMargen     = 20;
    this.transparenciaVentana   = 200;
    this.redondeo               = 10;
    this.strokeWeight           = 1;
    this.colorStroke            = "255, 255, 255";
    this.sombra                 = false;

    //Color texto
    this.colorTexto             = "0, 102, 153";

  }

  update(){

    this.xExt       = this.x - this.margen.izq;
    this.yExt       = this.y - this.margen.arriba;
    this.anchoExt   = this.ancho + this.margen.izq    + this.margen.dere;
    this.altoExt    = this.alto  + this.margen.arriba + this.margen.abajo;

  }// fin de update


  display(){

    stroke(this.colorStroke);
    //stroke(255,255,255);
    strokeWeight( this.strokeWeight );

    //Sombra de la ventana
    if (this.sombra) myBchain.sombra(3, 4);

    //Ventana exterior
    fill(this.brillo ,this.brillo , this.brillo , this.tranparenciaMargen);
    rect(this.xExt, this.yExt, 
         this.anchoExt,this.altoExt, 
         this.redondeo );

    //Sombra de la ventana
    if (this.sombra){
      myBchain.sombra(0, 0);
      this.sombra = false;
    }//fin this.sombra
    
    //Ventana Interior
    fill(this.brillo,this.brillo, this.brillo, this.transparenciaVentana );
    rect(this.x, this.y, 
         this.ancho,this.alto, 
         this.redondeo);

  }//fin display()

  oculta(){
    this.ancho        = 0 ;
    this.alto         = 0 ;
    
    //divAyuda.position(-10000 , -10000);

    this.update();

  }//fin display()
  
}// fin de class Ventana