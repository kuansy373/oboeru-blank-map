export const geoUrls = {
  initial:    { countriesLow: './data/countries-low.geojson' },
  background: {
    countries:      { url: './data/countries.geojson', type: 'polygon' },
    usaStates:      { url: './data/us_states.geojson', type: 'polygon' },
    chinaProvinces: { url: './data/china_provinces.geojson', type: 'polygon' },
    japanPrefectures: { url: './data/japan_prefectures.geojson', type: 'polygon' },
    dateLine:       { url: './data/international-date-line.geojson', type: 'line' },
  }
};

// 地域別カラー設定
export const regionColors = {
  Europe: '#50bab5',
  Africa: '#81ca98',
  'Middle East': '#b2b379',
  Asia: '#fa9eaa',
  Oceania: '#eb9272',
  'North America': '#c0d288',
  'South America': '#a3d3d8',
  Antarctica: '#a7b5ff',
  Default: '#000000',
  'USA States': '#98ccae',
  'China Provinces': '#eda398',
  'Japan Prefectures': '#ffd3cf',
};

// ビュー設定
export const regionView = {
  'Europe': { center: [14, 52], zoom: 2.7 },
  'Africa': { center: [17, 5], zoom: 2.4 },
  'Middle East': { center: [50, 30], zoom: 2.7 },
  'Asia': { center: [105, 25], zoom: 2.5 },
  'Oceania': { center: [147, -25], zoom: 2.5 },
  'North America': { center: [-85, 25], zoom: 3 },
  'South America': { center: [-60, -18], zoom: 2.4 },
  'Antarctica': { center: [70, -80], zoom: 1.5 },
  'USA States': { center: [-97, 40], zoom: 3 },
  'China Provinces': { center: [105, 37], zoom: 3 },
  'Japan Prefectures': { center: [138.7, 37.6], zoom: 4 },
};

// 判定用リスト
export const countryRegions = {
  Europe: [
    'Albania','Andorra','Armenia','Austria','Azerbaijan',
    'Belarus','Belgium','Bosnia and Herzegovina','Bulgaria',
    'Croatia','Cyprus','Czechia',
    'Denmark',
    'Estonia',
    'Finland','France',
    'Georgia','Germany','Greece',
    'Hungary',
    'Iceland','Ireland','Italy',
    'Kosovo',
    'Latvia','Liechtenstein','Lithuania','Luxembourg',
    'Malta','Moldova','Monaco','Montenegro',
    'Netherlands','North Macedonia','Norway',
    'Poland','Portugal',
    'Republic of Serbia','Romania','Russia',
    'San Marino','Slovakia','Slovenia','Spain','Sweden','Switzerland',
    'Ukraine','United Kingdom',
    'Vatican'
  ],
  Africa: [
    'Algeria','Angola',
    'Benin','Botswana','Burkina Faso','Burundi',
    'Cabo Verde','Cameroon','Central African Republic','Chad','Comoros',
    'Democratic Republic of the Congo','Djibouti',
    'Egypt','Equatorial Guinea','Eritrea','Eswatini','Ethiopia',
    'Gabon','Gambia','Ghana','Guinea','Guinea-Bissau',
    'Ivory Coast',
    'Kenya',
    'Lesotho','Liberia','Libya',
    'Madagascar','Malawi','Mali','Mauritania','Mauritius','Morocco','Mozambique',
    'Namibia','Niger','Nigeria',
    'Republic of the Congo','Rwanda',
    'São Tomé and Principe','Senegal','Seychelles','Sierra Leone','Somalia','South Africa','South Sudan','Sudan',
    'Togo','Tunisia',
    'Uganda','United Republic of Tanzania',
    'Western Sahara',
    'Zambia','Zimbabwe'
  ],
  'Middle East': [
    'Afghanistan',
    'Bahrain',
    'Iran','Iraq','Israel',
    'Jordan',
    'Kuwait',
    'Lebanon',
    'Oman',
    'Palestine',
    'Qatar',
    'Saudi Arabia','Syria',
    'Turkey',
    'United Arab Emirates',
    'Yemen'
  ],
  Asia: [
    'Bangladesh','Bhutan','Brunei',
    'Cambodia','China',
    'East Timor',
    'Hong Kong S.A.R.',
    'India','Indonesia',
    'Japan',
    'Kazakhstan','Kyrgyzstan',
    'Laos',
    'Macao S.A.R','Malaysia','Maldives','Mongolia','Myanmar',
    'Nepal','North Korea',
    'Pakistan','Philippines',
    'Singapore','South Korea','Sri Lanka',
    'Taiwan','Tajikistan','Thailand','Turkmenistan',
    'Uzbekistan',
    'Vietnam'
  ],
  Oceania: [
    'Australia',
    'Cook Islands',
    'Federated States of Micronesia','Fiji',
    'Kiribati',
    'Marshall Islands',
    'Nauru','New Caledonia','New Zealand','Niue',
    'Palau','Papua New Guinea',
    'Samoa','Solomon Islands',
    'Tonga','Tuvalu',
    'Vanuatu'
  ],
  'North America': [
    'Antigua and Barbuda',
    'Barbados','Belize','Bermuda',
    'Canada','Costa Rica','Cuba',
    'Dominica','Dominican Republic',
    'El Salvador',
    'Grenada','Greenland','Guatemala',
    'Haiti','Honduras',
    'Jamaica',
    'Mexico',
    'Nicaragua',
    'Panama','Puerto Rico',
    'Saint Kitts and Nevis','Saint Lucia','Saint Vincent and the Grenadines',
    'The Bahamas','Trinidad and Tobago',
    'United States of America'
  ],
  'South America': [
    'Argentina',
    'Bolivia','Brazil',
    'Chile','Colombia',
    'Ecuador',
    'Guyana',
    'Paraguay','Peru',
    'Suriname',
    'Uruguay',
    'Venezuela'
  ],
  Antarctica: [
    'Antarctica',
  ]
};

countryRegions['USA States'] = [];
countryRegions['China Provinces'] = [];
countryRegions['Japan Prefectures'] = [];
