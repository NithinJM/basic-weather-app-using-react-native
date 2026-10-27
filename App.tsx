import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Keyboard,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import * as Location from 'expo-location';
import { SafeAreaView } from 'react-native-safe-area-context';

type Place = { name: string; country?: string; latitude: number; longitude: number };
type Forecast = {
  current: { time: string; temperature_2m: number; apparent_temperature: number; relative_humidity_2m: number; wind_speed_10m: number; precipitation: number; weather_code: number; is_day: number };
  hourly: { time: string[]; temperature_2m: number[]; precipitation_probability: number[]; weather_code: number[] };
  daily: { time: string[]; weather_code: number[]; temperature_2m_max: number[]; temperature_2m_min: number[]; sunrise: string[]; sunset: string[]; uv_index_max: number[] };
};

const COLORS = { ink: '#17233B', muted: '#8893A6', blue: '#5479F7', pale: '#F4F6FB', line: '#EDF0F5', white: '#FFFFFF', yellow: '#FFCB65' };

function weather(code: number, isDay = 1) {
  if (code === 0) return { label: 'Clear sky', icon: isDay ? '☀️' : '🌙' };
  if (code <= 2) return { label: code === 1 ? 'Mostly clear' : 'Partly cloudy', icon: isDay ? '🌤️' : '☁️' };
  if (code === 3) return { label: 'Overcast', icon: '☁️' };
  if ([45, 48].includes(code)) return { label: 'Foggy', icon: '🌫️' };
  if ([51, 53, 55, 56, 57].includes(code)) return { label: 'Drizzle', icon: '🌦️' };
  if ([61, 63, 65, 66, 67, 80, 81, 82].includes(code)) return { label: 'Rain showers', icon: '🌧️' };
  if ([71, 73, 75, 77, 85, 86].includes(code)) return { label: 'Snow', icon: '🌨️' };
  if ([95, 96, 99].includes(code)) return { label: 'Thunderstorms', icon: '⛈️' };
  return { label: 'Cloudy', icon: '☁️' };
}

function hourLabel(iso: string, index: number) {
  if (index === 0) return 'Now';
  return new Date(iso).toLocaleTimeString([], { hour: 'numeric' });
}
function dayLabel(iso: string, index: number) {
  return index === 0 ? 'Today' : new Date(`${iso}T12:00:00`).toLocaleDateString([], { weekday: 'long' });
}
function timeLabel(iso: string) {
  return new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

export default function App() {
  const [place, setPlace] = useState<Place>({ name: 'Seattle', country: 'United States', latitude: 47.6062, longitude: -122.3321 });
  const [forecast, setForecast] = useState<Forecast | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [unit, setUnit] = useState<'C' | 'F'>('C');

  const loadForecast = useCallback(async (target: Place) => {
    setLoading(true);
    setError('');
    try {
      const url = `https://api.open-meteo.com/v1/forecast?latitude=${target.latitude}&longitude=${target.longitude}&current=temperature_2m,apparent_temperature,relative_humidity_2m,wind_speed_10m,precipitation,weather_code,is_day&hourly=temperature_2m,precipitation_probability,weather_code&daily=weather_code,temperature_2m_max,temperature_2m_min,sunrise,sunset,uv_index_max&forecast_days=7&timezone=auto`;
      const response = await fetch(url);
      if (!response.ok) throw new Error('Weather data is unavailable right now.');
      const data = (await response.json()) as Forecast;
      setForecast(data);
    } catch (err) {
      setForecast(null);
      setError(err instanceof Error ? err.message : 'Could not load the forecast. Check your connection and try again.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void loadForecast(place); }, [place, loadForecast]);

  const temperature = useCallback((celsius: number) => Math.round(unit === 'C' ? celsius : celsius * 9 / 5 + 32), [unit]);
  const currentWeather = useMemo(() => forecast ? weather(forecast.current.weather_code, forecast.current.is_day) : null, [forecast]);

  const searchCity = async () => {
    const term = query.trim();
    if (!term) return;
    Keyboard.dismiss();
    setSearching(true);
    setError('');
    try {
      const response = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(term)}&count=1&language=en&format=json`);
      const data = await response.json();
      if (!data.results?.length) throw new Error(`No city found for “${term}”. Try another name.`);
      const result = data.results[0];
      setPlace({ name: result.name, country: result.country, latitude: result.latitude, longitude: result.longitude });
      setQuery('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not search for that city.');
    } finally {
      setSearching(false);
    }
  };

  const useMyLocation = async () => {
    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (permission.status !== 'granted') throw new Error('Location permission was not granted. You can search for a city instead.');
      const position = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const coords = position.coords;
      let name = 'My location';
      let country = '';
      try {
        const [address] = await Location.reverseGeocodeAsync({ latitude: coords.latitude, longitude: coords.longitude });
        name = address.city || address.subregion || address.region || name;
        country = address.country || '';
      } catch { /* The coordinates still work if reverse geocoding is unavailable. */ }
      setPlace({ name, country, latitude: coords.latitude, longitude: coords.longitude });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not get your location.');
    }
  };

  const hourlyStart = forecast ? Math.max(0, forecast.hourly.time.findIndex((time) => time.slice(0, 13) === forecast.current.time.slice(0, 13))) : 0;
  const shownHours = forecast ? forecast.hourly.time.slice(hourlyStart, hourlyStart + 12) : [];

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="dark-content" />
      <ScrollView contentContainerStyle={styles.page} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        <View style={styles.topRow}>
          <View style={styles.brand}><View style={styles.brandIcon}><Text style={styles.brandEmoji}>☀</Text></View><Text style={styles.brandName}>weatherly</Text></View>
          <Pressable onPress={useMyLocation} style={styles.locationButton} accessibilityLabel="Use my location"><Text style={styles.locationIcon}>◎</Text></Pressable>
        </View>

        <View style={styles.searchWrap}>
          <Text style={styles.searchIcon}>⌕</Text>
          <TextInput value={query} onChangeText={setQuery} onSubmitEditing={searchCity} returnKeyType="search" placeholder="Search city" placeholderTextColor="#9AA4B4" style={styles.searchInput} />
          {searching ? <ActivityIndicator color={COLORS.blue} /> : query.length > 0 ? <Pressable onPress={searchCity} style={styles.searchGo}><Text style={styles.searchGoText}>Go</Text></Pressable> : null}
        </View>

        <View style={styles.locationHeading}>
          <View style={{ flex: 1 }}><Text style={styles.city}>{place.name}</Text><Text style={styles.country}>{place.country || 'Local forecast'} · {new Date().toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' })}</Text></View>
          <Pressable onPress={() => setUnit(unit === 'C' ? 'F' : 'C')} style={styles.unitToggle}><Text style={[styles.unitOption, unit === 'C' && styles.unitActive]}>°C</Text><Text style={[styles.unitOption, unit === 'F' && styles.unitActive]}>°F</Text></Pressable>
        </View>

        {error ? <View style={styles.errorBox}><Text style={styles.errorText}>{error}</Text><Pressable onPress={() => void loadForecast(place)}><Text style={styles.retry}>Retry</Text></Pressable></View> : null}

        <View style={styles.hero}>
          <View style={styles.heroOrb} /><View style={styles.heroOrbSmall} />
          {loading && !forecast ? <ActivityIndicator size="large" color="#fff" style={{ height: 228 }} /> : forecast && currentWeather ? <>
            <View style={styles.heroTop}><View><Text style={styles.heroEyebrow}>CURRENT WEATHER</Text><Text style={styles.heroCondition}>{currentWeather.label}</Text></View><Text style={styles.heroIcon}>{currentWeather.icon}</Text></View>
            <View style={styles.tempRow}><Text style={styles.temp}>{temperature(forecast.current.temperature_2m)}</Text><Text style={styles.degree}>°{unit}</Text></View>
            <Text style={styles.feels}>Feels like {temperature(forecast.current.apparent_temperature)}° · H:{temperature(forecast.daily.temperature_2m_max[0])}°  L:{temperature(forecast.daily.temperature_2m_min[0])}°</Text>
            <View style={styles.heroFoot}><Text style={styles.sunText}>☀  Sunrise {timeLabel(forecast.daily.sunrise[0])}</Text><Text style={styles.heroFootRight}>Sunset {timeLabel(forecast.daily.sunset[0])}  ◒</Text></View>
          </> : <View style={styles.emptyHero}><Text style={styles.emptyIcon}>🌤️</Text><Text style={styles.emptyTitle}>Forecast unavailable</Text><Text style={styles.emptyCopy}>Pull in fresh weather data when you’re back online.</Text></View>}
        </View>

        {forecast ? <>
          <View style={styles.sectionHeading}><Text style={styles.sectionTitle}>Hourly forecast</Text><Text style={styles.sectionHint}>Next 12 hours</Text></View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.hourlyCard}>
            {shownHours.map((time, i) => { const index = hourlyStart + i; const condition = weather(forecast.hourly.weather_code[index]); return <View key={time} style={[styles.hourItem, i === 0 && styles.hourNow]}><Text style={styles.hourTime}>{hourLabel(time, i)}</Text><Text style={styles.hourIcon}>{condition.icon}</Text><Text style={styles.hourTemp}>{temperature(forecast.hourly.temperature_2m[index])}°</Text><Text style={styles.hourRain}>💧 {forecast.hourly.precipitation_probability[index]}%</Text></View>; })}
          </ScrollView>

          <View style={styles.sectionHeading}><Text style={styles.sectionTitle}>7-day forecast</Text><Text style={styles.sectionHint}>Next few days</Text></View>
          <View style={styles.forecastCard}>{forecast.daily.time.map((day, i) => { const condition = weather(forecast.daily.weather_code[i]); return <View key={day} style={[styles.dayRow, i > 0 && styles.dayDivider]}><Text style={styles.dayName}>{dayLabel(day, i)}</Text><Text style={styles.dayIcon}>{condition.icon}</Text><Text style={styles.dayCondition}>{condition.label}</Text><View style={styles.dayTemps}><Text style={styles.dayHigh}>{temperature(forecast.daily.temperature_2m_max[i])}°</Text><Text style={styles.dayLow}>{temperature(forecast.daily.temperature_2m_min[i])}°</Text></View></View>; })}</View>

          <View style={styles.sectionHeading}><Text style={styles.sectionTitle}>Today's details</Text></View>
          <View style={styles.detailsGrid}>
            <DetailCard icon="🌡️" label="Feels like" value={`${temperature(forecast.current.apparent_temperature)}°`} note={forecast.current.apparent_temperature < forecast.current.temperature_2m ? 'A little chilly' : 'About the same'} />
            <DetailCard icon="💧" label="Humidity" value={`${forecast.current.relative_humidity_2m}%`} note="Relative humidity" />
            <DetailCard icon="💨" label="Wind" value={`${Math.round(forecast.current.wind_speed_10m)} km/h`} note="Steady breeze" />
            <DetailCard icon="☀️" label="UV index" value={`${forecast.daily.uv_index_max[0]}`} note="Today's peak" />
          </View>
          <Text style={styles.attribution}>Weather data by Open-Meteo</Text>
        </> : null}
      </ScrollView>
    </SafeAreaView>
  );
}

function DetailCard({ icon, label, value, note }: { icon: string; label: string; value: string; note: string }) {
  return <View style={styles.detailCard}><View style={styles.detailTop}><Text style={styles.detailIcon}>{icon}</Text><Text style={styles.detailLabel}>{label}</Text></View><Text style={styles.detailValue}>{value}</Text><Text style={styles.detailNote}>{note}</Text></View>;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.pale }, page: { paddingHorizontal: 22, paddingBottom: 36 },
  topRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: 8, paddingBottom: 19 },
  brand: { flexDirection: 'row', alignItems: 'center', gap: 9 }, brandIcon: { width: 31, height: 31, borderRadius: 11, backgroundColor: '#FFF0D4', alignItems: 'center', justifyContent: 'center' }, brandEmoji: { color: '#F2A926', fontSize: 21, fontWeight: '700' }, brandName: { fontSize: 19, fontWeight: '800', color: COLORS.ink, letterSpacing: -0.6 },
  locationButton: { width: 40, height: 40, backgroundColor: COLORS.white, borderRadius: 14, alignItems: 'center', justifyContent: 'center' }, locationIcon: { color: COLORS.blue, fontSize: 26, lineHeight: 30 },
  searchWrap: { height: 48, borderRadius: 15, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.white, marginBottom: 23, borderWidth: 1, borderColor: '#EEF0F5' }, searchIcon: { color: '#929CAE', fontSize: 25, marginRight: 8 }, searchInput: { flex: 1, fontSize: 14, color: COLORS.ink, paddingVertical: 0 }, searchGo: { backgroundColor: '#EEF1FF', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 9 }, searchGoText: { color: COLORS.blue, fontWeight: '700' },
  locationHeading: { flexDirection: 'row', alignItems: 'center', marginBottom: 17 }, city: { color: COLORS.ink, fontSize: 25, lineHeight: 30, fontWeight: '800', letterSpacing: -0.7 }, country: { color: COLORS.muted, fontSize: 12, marginTop: 3 }, unitToggle: { flexDirection: 'row', backgroundColor: '#E9ECF3', borderRadius: 11, padding: 3 }, unitOption: { color: '#8A94A6', fontSize: 12, fontWeight: '700', paddingHorizontal: 9, paddingVertical: 6, overflow: 'hidden', borderRadius: 8 }, unitActive: { color: COLORS.ink, backgroundColor: COLORS.white },
  hero: { backgroundColor: '#627FF0', borderRadius: 25, padding: 21, overflow: 'hidden', marginBottom: 25, minHeight: 228 }, heroOrb: { position: 'absolute', width: 230, height: 230, borderRadius: 115, backgroundColor: 'rgba(255,255,255,0.07)', right: -74, top: -85 }, heroOrbSmall: { position: 'absolute', width: 150, height: 150, borderRadius: 75, borderWidth: 1, borderColor: 'rgba(255,255,255,0.09)', right: -28, top: -37 }, heroTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, heroEyebrow: { color: '#D5DFFF', fontSize: 10, letterSpacing: 1.2, fontWeight: '800' }, heroCondition: { color: '#fff', fontSize: 17, fontWeight: '600', marginTop: 6 }, heroIcon: { fontSize: 45 }, tempRow: { flexDirection: 'row', alignItems: 'flex-start', marginTop: -4 }, temp: { color: '#fff', fontSize: 72, lineHeight: 82, fontWeight: '300', letterSpacing: -4 }, degree: { color: '#fff', fontSize: 25, marginTop: 11, marginLeft: 4, fontWeight: '300' }, feels: { color: '#E0E6FF', fontSize: 12, marginTop: -1 }, heroFoot: { flexDirection: 'row', justifyContent: 'space-between', borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.2)', marginTop: 16, paddingTop: 12 }, sunText: { color: '#fff', fontSize: 10, fontWeight: '600' }, heroFootRight: { color: '#E0E6FF', fontSize: 10 }, emptyHero: { alignItems: 'center', justifyContent: 'center', minHeight: 185 }, emptyIcon: { fontSize: 37 }, emptyTitle: { color: '#fff', fontSize: 18, fontWeight: '700', marginTop: 8 }, emptyCopy: { color: '#E0E6FF', fontSize: 12, marginTop: 5, textAlign: 'center' },
  sectionHeading: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 12 }, sectionTitle: { color: COLORS.ink, fontSize: 16, fontWeight: '800', letterSpacing: -0.3 }, sectionHint: { color: COLORS.muted, fontSize: 11 },
  hourlyCard: { padding: 12, backgroundColor: COLORS.white, borderRadius: 20, marginBottom: 24, gap: 5 }, hourItem: { width: 62, alignItems: 'center', paddingVertical: 8, borderRadius: 14 }, hourNow: { backgroundColor: '#EEF1FF' }, hourTime: { color: COLORS.muted, fontSize: 10, fontWeight: '600' }, hourIcon: { fontSize: 23, marginTop: 12, marginBottom: 9 }, hourTemp: { color: COLORS.ink, fontWeight: '800', fontSize: 15 }, hourRain: { color: '#7295EA', fontSize: 9, marginTop: 9 },
  forecastCard: { backgroundColor: COLORS.white, borderRadius: 20, paddingHorizontal: 15, paddingVertical: 4, marginBottom: 23 }, dayRow: { height: 47, flexDirection: 'row', alignItems: 'center' }, dayDivider: { borderTopWidth: 1, borderTopColor: COLORS.line }, dayName: { width: 82, fontSize: 12, fontWeight: '700', color: COLORS.ink }, dayIcon: { width: 32, fontSize: 18 }, dayCondition: { flex: 1, fontSize: 11, color: COLORS.muted }, dayTemps: { flexDirection: 'row', width: 77, justifyContent: 'flex-end', gap: 13 }, dayHigh: { color: COLORS.ink, fontSize: 12, fontWeight: '700' }, dayLow: { color: '#A4ADBA', fontSize: 12, fontWeight: '600' },
  detailsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 11 }, detailCard: { width: '48%', flexGrow: 1, backgroundColor: COLORS.white, borderRadius: 18, padding: 14, minHeight: 110 }, detailTop: { flexDirection: 'row', alignItems: 'center', gap: 7 }, detailIcon: { fontSize: 14 }, detailLabel: { color: COLORS.muted, fontSize: 11, fontWeight: '600' }, detailValue: { color: COLORS.ink, fontSize: 21, fontWeight: '800', marginTop: 9 }, detailNote: { color: '#A0A9B7', fontSize: 10, marginTop: 3 }, attribution: { color: '#A5ADBA', fontSize: 10, textAlign: 'center', marginTop: 22 },
  errorBox: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFF2F0', borderRadius: 12, padding: 12, marginBottom: 14, gap: 10 }, errorText: { color: '#A64A42', flex: 1, fontSize: 12 }, retry: { color: '#C34F45', fontSize: 12, fontWeight: '800' },
});
