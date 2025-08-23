// Utility untuk mengkonversi angka ke terbilang dalam Bahasa Indonesia
export function terbilang(angka: number): string {
  if (angka === 0) return 'Nol Rupiah';
  
  const satuan = [
    '', 'Satu', 'Dua', 'Tiga', 'Empat', 'Lima', 
    'Enam', 'Tujuh', 'Delapan', 'Sembilan'
  ];
  
  const belasan = [
    'Sepuluh', 'Sebelas', 'Dua Belas', 'Tiga Belas', 'Empat Belas', 
    'Lima Belas', 'Enam Belas', 'Tujuh Belas', 'Delapan Belas', 'Sembilan Belas'
  ];
  
  const puluhan = [
    '', '', 'Dua Puluh', 'Tiga Puluh', 'Empat Puluh', 'Lima Puluh',
    'Enam Puluh', 'Tujuh Puluh', 'Delapan Puluh', 'Sembilan Puluh'
  ];

  function konversiRatusan(n: number): string {
    let hasil = '';
    
    const ratus = Math.floor(n / 100);
    const sisaRatus = n % 100;
    
    if (ratus > 0) {
      if (ratus === 1) {
        hasil += 'Seratus';
      } else {
        hasil += satuan[ratus] + ' Ratus';
      }
      
      if (sisaRatus > 0) hasil += ' ';
    }
    
    if (sisaRatus >= 10 && sisaRatus < 20) {
      hasil += belasan[sisaRatus - 10];
    } else {
      const puluh = Math.floor(sisaRatus / 10);
      const satu = sisaRatus % 10;
      
      if (puluh > 0) {
        hasil += puluhan[puluh];
        if (satu > 0) hasil += ' ';
      }
      
      if (satu > 0) {
        hasil += satuan[satu];
      }
    }
    
    return hasil;
  }

  let hasil = '';
  let angkaStr = Math.abs(angka).toString();
  
  // Handle negative numbers
  if (angka < 0) {
    hasil = 'Minus ';
  }
  
  // Pisahkan berdasarkan kelompok ribuan
  const panjang = angkaStr.length;
  
  if (panjang <= 3) {
    // Ratusan
    hasil += konversiRatusan(Math.abs(angka));
  } else if (panjang <= 6) {
    // Ribuan
    const ribu = Math.floor(Math.abs(angka) / 1000);
    const sisaRibu = Math.abs(angka) % 1000;
    
    if (ribu === 1) {
      hasil += 'Seribu';
    } else {
      hasil += konversiRatusan(ribu) + ' Ribu';
    }
    
    if (sisaRibu > 0) {
      hasil += ' ' + konversiRatusan(sisaRibu);
    }
  } else if (panjang <= 9) {
    // Jutaan
    const juta = Math.floor(Math.abs(angka) / 1000000);
    const sisaJuta = Math.abs(angka) % 1000000;
    
    if (juta === 1) {
      hasil += 'Satu Juta';
    } else {
      hasil += konversiRatusan(juta) + ' Juta';
    }
    
    if (sisaJuta >= 1000) {
      const ribu = Math.floor(sisaJuta / 1000);
      const sisaRibu = sisaJuta % 1000;
      
      hasil += ' ';
      if (ribu === 1) {
        hasil += 'Seribu';
      } else {
        hasil += konversiRatusan(ribu) + ' Ribu';
      }
      
      if (sisaRibu > 0) {
        hasil += ' ' + konversiRatusan(sisaRibu);
      }
    } else if (sisaJuta > 0) {
      hasil += ' ' + konversiRatusan(sisaJuta);
    }
  } else if (panjang <= 12) {
    // Miliaran
    const miliar = Math.floor(Math.abs(angka) / 1000000000);
    const sisaMiliar = Math.abs(angka) % 1000000000;
    
    if (miliar === 1) {
      hasil += 'Satu Miliar';
    } else {
      hasil += konversiRatusan(miliar) + ' Miliar';
    }
    
    if (sisaMiliar >= 1000000) {
      const juta = Math.floor(sisaMiliar / 1000000);
      const sisaJuta = sisaMiliar % 1000000;
      
      hasil += ' ';
      if (juta === 1) {
        hasil += 'Satu Juta';
      } else {
        hasil += konversiRatusan(juta) + ' Juta';
      }
      
      if (sisaJuta >= 1000) {
        const ribu = Math.floor(sisaJuta / 1000);
        const sisaRibu = sisaJuta % 1000;
        
        hasil += ' ';
        if (ribu === 1) {
          hasil += 'Seribu';
        } else {
          hasil += konversiRatusan(ribu) + ' Ribu';
        }
        
        if (sisaRibu > 0) {
          hasil += ' ' + konversiRatusan(sisaRibu);
        }
      } else if (sisaJuta > 0) {
        hasil += ' ' + konversiRatusan(sisaJuta);
      }
    } else if (sisaMiliar >= 1000) {
      const ribu = Math.floor(sisaMiliar / 1000);
      const sisaRibu = sisaMiliar % 1000;
      
      hasil += ' ';
      if (ribu === 1) {
        hasil += 'Seribu';
      } else {
        hasil += konversiRatusan(ribu) + ' Ribu';
      }
      
      if (sisaRibu > 0) {
        hasil += ' ' + konversiRatusan(sisaRibu);
      }
    } else if (sisaMiliar > 0) {
      hasil += ' ' + konversiRatusan(sisaMiliar);
    }
  } else {
    // Untuk angka yang sangat besar, gunakan format yang lebih sederhana
    return 'Jumlah Terlalu Besar';
  }
  
  return hasil.trim() + ' Rupiah';
}

// Export alias for backward compatibility
export const numberToWords = terbilang;