import React, { useState, useEffect, useRef } from 'react';
import { Music, Play, Pause, SkipForward, SkipBack, Upload, Edit3, Trash2, Clock, Users, LogOut, Plus, Save, X, Settings } from 'lucide-react';
import axios from 'axios';
import './App.css';

axios.defaults.baseURL = import.meta.env.PROD ? window.location.origin : '';
axios.defaults.withCredentials = true;

const App = () => {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [currentUser, setCurrentUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [users, setUsers] = useState([]);
  const [playlist, setPlaylist] = useState([]);
  const [currentTrack, setCurrentTrack] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [silenceDuration, setSilenceDuration] = useState(2);
  const [fadeEnabled, setFadeEnabled] = useState(true);
  const [maxPlayDuration, setMaxPlayDuration] = useState(60);
  const [totalPlayTime, setTotalPlayTime] = useState(0);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [schedules, setSchedules] = useState([]);
  const [isInSilencePeriod, setIsInSilencePeriod] = useState(false);
  const [silenceRemaining, setSilenceRemaining] = useState(0);
  const [activeView, setActiveView] = useState('player');
  const [editingTrack, setEditingTrack] = useState(null);
  const [newSchedule, setNewSchedule] = useState({ time: '', days: [], action: 'play' });
  const [loginForm, setLoginForm] = useState({ username: '', password: '' });
  const [newUser, setNewUser] = useState({ username: '', password: '', role: 'user' });
  const audioRef = useRef(null);
  const playTimeIntervalRef = useRef(null);
  const silenceCountdownRef = useRef(null);

  useEffect(() => { checkAuth(); }, []);

  const checkAuth = async () => {
    try {
      const response = await axios.get('/api/verify');
      setCurrentUser(response.data);
      setIsLoggedIn(true);
      loadData();
    } catch (error) {
      setIsLoggedIn(false);
    } finally {
      setLoading(false);
    }
  };

  const loadData = async () => {
    try {
      const [tracksRes, schedulesRes, settingsRes, usersRes] = await Promise.all([
        axios.get('/api/tracks'),
        axios.get('/api/schedules'),
        axios.get('/api/settings'),
        axios.get('/api/users').catch(() => ({ data: [] }))
      ]);
      setPlaylist(tracksRes.data);
      setSchedules(schedulesRes.data);
      setSilenceDuration(settingsRes.data.silence_duration);
      setFadeEnabled(settingsRes.data.fade_enabled === 1);
      setMaxPlayDuration(settingsRes.data.max_play_duration);
      setUsers(usersRes.data);
    } catch (error) {
      console.error('Error loading data:', error);
    }
  };

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (isPlaying && !isInSilencePeriod) {
      playTimeIntervalRef.current = setInterval(() => {
        setTotalPlayTime(prev => {
          const newTime = prev + 1;
          if (newTime >= maxPlayDuration * 60) {
            setIsPlaying(false);
            setIsInSilencePeriod(true);
            setSilenceRemaining(silenceDuration);
            return 0;
          }
          return newTime;
        });
      }, 1000);
    } else {
      if (playTimeIntervalRef.current) clearInterval(playTimeIntervalRef.current);
    }
    return () => { if (playTimeIntervalRef.current) clearInterval(playTimeIntervalRef.current); };
  }, [isPlaying, maxPlayDuration, isInSilencePeriod, silenceDuration]);

  useEffect(() => {
    if (isInSilencePeriod && silenceRemaining > 0) {
      silenceCountdownRef.current = setInterval(() => {
        setSilenceRemaining(prev => {
          if (prev <= 1) {
            setIsInSilencePeriod(false);
            setIsPlaying(true);
            setTotalPlayTime(0);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    } else {
      if (silenceCountdownRef.current) clearInterval(silenceCountdownRef.current);
    }
    return () => { if (silenceCountdownRef.current) clearInterval(silenceCountdownRef.current); };
  }, [isInSilencePeriod, silenceRemaining]);

  useEffect(() => {
    if (audioRef.current && playlist.length > 0) {
      if (isPlaying && !isInSilencePeriod) {
        audioRef.current.play().catch(console.error);
      } else {
        audioRef.current.pause();
      }
    }
  }, [isPlaying, currentTrack, isInSilencePeriod, playlist]);

  useEffect(() => {
    const interval = setInterval(() => {
      const now = new Date();
      const currentTimeStr = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
      const currentDay = now.getDay();
      schedules.forEach(schedule => {
        const shouldTrigger = schedule.time === currentTimeStr && schedule.days.includes(currentDay) && !schedule.triggered;
        if (shouldTrigger) {
          if (schedule.action === 'play') { setIsPlaying(true); setTotalPlayTime(0); }
          if (schedule.action === 'pause') setIsPlaying(false);
          schedule.triggered = true;
          setTimeout(() => { schedule.triggered = false; }, 60000);
        }
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [schedules]);

  const handleLogin = async (e) => {
    e.preventDefault();
    try {
      const response = await axios.post('/api/login', loginForm);
      setCurrentUser(response.data);
      setIsLoggedIn(true);
      setLoginForm({ username: '', password: '' });
      loadData();
    } catch (error) { alert('Invalid credentials'); }
  };

  const handleLogout = async () => {
    await axios.post('/api/logout');
    setIsLoggedIn(false);
    setCurrentUser(null);
    setActiveView('player');
  };

  const handlePlayPause = () => { if (!isInSilencePeriod) setIsPlaying(!isPlaying); };
  const handleNextTrack = () => { setCurrentTrack(currentTrack < playlist.length - 1 ? currentTrack + 1 : 0); };
  const handlePrevTrack = () => { setCurrentTrack(currentTrack > 0 ? currentTrack - 1 : playlist.length - 1); };
  const handleTrackSelect = (index) => { setCurrentTrack(index); setIsPlaying(true); };

  const handleUpload = async (e) => {
    const formData = new FormData();
    Array.from(e.target.files).forEach(file => formData.append('files', file));
    try {
      await axios.post('/api/tracks/upload', formData, { headers: { 'Content-Type': 'multipart/form-data' } });
      loadData();
    } catch (error) { alert('Upload failed: ' + error.message); }
  };

  const handleDeleteTrack = async (id) => {
    if (window.confirm('Delete this track?')) {
      try { await axios.delete(`/api/tracks/${id}`); loadData(); }
      catch (error) { alert('Delete failed'); }
    }
  };

  const handleEditTrack = (track) => { setEditingTrack({ ...track }); };
  const handleSaveEdit = async () => {
    try {
      await axios.put(`/api/tracks/${editingTrack.id}`, { title: editingTrack.title, artist: editingTrack.artist });
      setEditingTrack(null);
      loadData();
    } catch (error) { alert('Save failed'); }
  };

  const handleAddSchedule = async () => {
    if (newSchedule.time && newSchedule.days.length > 0) {
      try {
        await axios.post('/api/schedules', newSchedule);
        setNewSchedule({ time: '', days: [], action: 'play' });
        loadData();
      } catch (error) { alert('Failed to add schedule'); }
    }
  };

  const handleDeleteSchedule = async (id) => {
    try { await axios.delete(`/api/schedules/${id}`); loadData(); }
    catch (error) { alert('Failed to delete schedule'); }
  };

  const handleAddUser = async () => {
    if (newUser.username && newUser.password) {
      try {
        await axios.post('/api/users', newUser);
        setNewUser({ username: '', password: '', role: 'user' });
        loadData();
      } catch (error) { alert('Failed to add user'); }
    }
  };

  const handleDeleteUser = async (id) => {
    if (window.confirm('Delete this user?')) {
      try { await axios.delete(`/api/users/${id}`); loadData(); }
      catch (error) { alert('Failed to delete user'); }
    }
  };

  const moveTrack = async (index, direction) => {
    const newPlaylist = [...playlist];
    const newIndex = direction === 'up' ? index - 1 : index + 1;
    if (newIndex >= 0 && newIndex < playlist.length) {
      [newPlaylist[index], newPlaylist[newIndex]] = [newPlaylist[newIndex], newPlaylist[index]];
      setPlaylist(newPlaylist);
      try { await axios.post('/api/tracks/reorder', { tracks: newPlaylist }); }
      catch (error) { console.error('Failed to reorder:', error); loadData(); }
    }
  };

  const saveSettings = async () => {
    try {
      await axios.put('/api/settings', { silence_duration: silenceDuration, fade_enabled: fadeEnabled, max_play_duration: maxPlayDuration });
      alert('Settings saved!');
    } catch (error) { alert('Failed to save settings'); }
  };

  const toggleDay = (day) => {
    const days = newSchedule.days.includes(day) ? newSchedule.days.filter(d => d !== day) : [...newSchedule.days, day];
    setNewSchedule({...newSchedule, days});
  };

  const formatTime = (s) => `${Math.floor(s/60)}:${(s%60).toString().padStart(2,'0')}`;
  const formatDuration = (m) => m<60?`${m} min`:`${Math.floor(m/60)}h${m%60>0?` ${m%60}m`:''}`;
  const formatSilence = (s) => s<60?`${s}s`:`${Math.floor(s/60)}m${s%60>0?` ${s%60}s`:''}`;
  const getDayName = (d) => ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][d];

  if (loading) return <div className="min-h-screen bg-gradient-to-br from-purple-900 via-indigo-900 to-blue-900 flex items-center justify-center"><div className="text-white text-2xl">Loading...</div></div>;

  if (!isLoggedIn) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-900 via-indigo-900 to-blue-900 flex items-center justify-center p-4">
        <div className="bg-white/10 backdrop-blur-lg rounded-2xl p-8 w-full max-w-md shadow-2xl">
          <div className="flex items-center justify-center mb-8"><Music className="w-16 h-16 text-purple-300" /></div>
          <h1 className="text-3xl font-bold text-white text-center mb-8">Music Player</h1>
          <div className="space-y-4">
            <div><label className="block text-purple-200 mb-2">Username</label><input type="text" value={loginForm.username} onChange={(e)=>setLoginForm({...loginForm,username:e.target.value})} onKeyPress={(e)=>e.key==='Enter'&&handleLogin(e)} className="w-full px-4 py-3 bg-white/20 border border-white/30 rounded-lg text-white placeholder-purple-200 focus:outline-none focus:border-purple-400" placeholder="Enter username"/></div>
            <div><label className="block text-purple-200 mb-2">Password</label><input type="password" value={loginForm.password} onChange={(e)=>setLoginForm({...loginForm,password:e.target.value})} onKeyPress={(e)=>e.key==='Enter'&&handleLogin(e)} className="w-full px-4 py-3 bg-white/20 border border-white/30 rounded-lg text-white placeholder-purple-200 focus:outline-none focus:border-purple-400" placeholder="Enter password"/></div>
            <button onClick={handleLogin} className="w-full bg-purple-600 hover:bg-purple-700 text-white font-semibold py-3 rounded-lg transition-colors">Login</button>
          </div>
          <p className="text-purple-200 text-sm text-center mt-4">Default: admin/admin123</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-900 via-indigo-900 to-blue-900 p-4">
      {playlist.length>0&&playlist[currentTrack]&&<audio ref={audioRef} src={`${window.location.origin}/uploads/${playlist[currentTrack].filename}`} onEnded={handleNextTrack}/>}
      <div className="max-w-7xl mx-auto">
        <div className="bg-white/10 backdrop-blur-lg rounded-2xl p-6 mb-4 shadow-xl">
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div className="flex items-center gap-3"><Music className="w-8 h-8 text-purple-300"/><h1 className="text-2xl font-bold text-white">Music Player</h1></div>
            <div className="flex items-center gap-4 flex-wrap">
              <div className="text-purple-200 text-sm"><div className="font-semibold">{currentTime.toLocaleDateString()}</div><div>{currentTime.toLocaleTimeString()}</div></div>
              <span className="text-purple-200">Welcome, {currentUser.username}</span>
              <button onClick={handleLogout} className="flex items-center gap-2 bg-red-500/80 hover:bg-red-600 text-white px-4 py-2 rounded-lg transition-colors"><LogOut className="w-4 h-4"/>Logout</button>
            </div>
          </div>
        </div>
        <div className="bg-white/10 backdrop-blur-lg rounded-2xl p-4 mb-4 shadow-xl">
          <div className="flex gap-2 flex-wrap">
            <button onClick={()=>setActiveView('player')} className={`px-4 py-2 rounded-lg font-semibold transition-colors ${activeView==='player'?'bg-purple-600 text-white':'bg-white/20 text-purple-200 hover:bg-white/30'}`}>Player</button>
            <button onClick={()=>setActiveView('playlist')} className={`px-4 py-2 rounded-lg font-semibold transition-colors ${activeView==='playlist'?'bg-purple-600 text-white':'bg-white/20 text-purple-200 hover:bg-white/30'}`}>Manage Music</button>
            <button onClick={()=>setActiveView('schedule')} className={`px-4 py-2 rounded-lg font-semibold transition-colors ${activeView==='schedule'?'bg-purple-600 text-white':'bg-white/20 text-purple-200 hover:bg-white/30'}`}><Clock className="w-4 h-4 inline mr-2"/>Schedule</button>
            <button onClick={()=>setActiveView('settings')} className={`px-4 py-2 rounded-lg font-semibold transition-colors ${activeView==='settings'?'bg-purple-600 text-white':'bg-white/20 text-purple-200 hover:bg-white/30'}`}><Settings className="w-4 h-4 inline mr-2"/>Settings</button>
            {currentUser.role==='admin'&&<button onClick={()=>setActiveView('admin')} className={`px-4 py-2 rounded-lg font-semibold transition-colors ${activeView==='admin'?'bg-purple-600 text-white':'bg-white/20 text-purple-200 hover:bg-white/30'}`}><Users className="w-4 h-4 inline mr-2"/>Admin</button>}
          </div>
        </div>
<div className="bg-white/10 backdrop-blur-lg rounded-2xl p-6 shadow-xl">
          {activeView==='player'&&(
            <div className="space-y-6">
              <div className="bg-gradient-to-r from-purple-500/30 to-pink-500/30 rounded-xl p-8 text-center">
                <Music className="w-20 h-20 mx-auto mb-4 text-purple-300"/>
                <h2 className="text-3xl font-bold text-white mb-2">{playlist[currentTrack]?.title||'No Track'}</h2>
                <p className="text-purple-200 text-lg">{playlist[currentTrack]?.artist||'Unknown Artist'}</p>
              </div>
              <div className="flex justify-center items-center gap-4">
                <button onClick={handlePrevTrack} disabled={isInSilencePeriod} className="bg-purple-600 hover:bg-purple-700 text-white p-4 rounded-full transition-colors disabled:opacity-50 disabled:cursor-not-allowed"><SkipBack className="w-6 h-6"/></button>
                <button onClick={handlePlayPause} disabled={isInSilencePeriod} className="bg-pink-600 hover:bg-pink-700 text-white p-6 rounded-full transition-colors disabled:opacity-50 disabled:cursor-not-allowed">{isPlaying?<Pause className="w-8 h-8"/>:<Play className="w-8 h-8"/>}</button>
                <button onClick={handleNextTrack} disabled={isInSilencePeriod} className="bg-purple-600 hover:bg-purple-700 text-white p-4 rounded-full transition-colors disabled:opacity-50 disabled:cursor-not-allowed"><SkipForward className="w-6 h-6"/></button>
              </div>
              {isInSilencePeriod&&<div className="bg-yellow-500/20 border-2 border-yellow-500 rounded-lg p-4 text-center"><div className="text-yellow-300 font-semibold text-lg mb-2">🔇 Mandatory Silence Period</div><div className="text-white text-2xl font-bold mb-1">{formatSilence(silenceRemaining)}</div><div className="text-yellow-200 text-sm">Playback will resume automatically</div></div>}
              <div className="bg-white/10 p-4 rounded-lg">
                <div className="flex justify-between items-center mb-2"><span className="text-purple-200">Play Time Remaining</span><span className="text-white font-semibold">{formatTime((maxPlayDuration*60)-totalPlayTime)} / {formatDuration(maxPlayDuration)}</span></div>
                <div className="w-full bg-gray-700 rounded-full h-3 overflow-hidden"><div className="bg-gradient-to-r from-purple-500 to-pink-500 h-full transition-all duration-1000" style={{width:`${(totalPlayTime/(maxPlayDuration*60))*100}%`}}></div></div>
                <div className="mt-2 text-purple-200 text-sm text-center">After max duration, {formatSilence(silenceDuration)} of silence before auto-resume</div>
              </div>
              <div className="mt-8"><h3 className="text-xl font-semibold text-white mb-4">Current Playlist</h3><div className="space-y-2 max-h-64 overflow-y-auto">{playlist.length===0?<div className="text-center text-purple-200 py-8">No tracks in playlist. Upload some music!</div>:playlist.map((track,idx)=><div key={track.id} onClick={()=>handleTrackSelect(idx)} className={`p-4 rounded-lg cursor-pointer transition-colors ${idx===currentTrack?'bg-purple-600 text-white':'bg-white/10 text-purple-200 hover:bg-white/20'}`}><div className="flex justify-between items-center"><div><div className="font-semibold">{track.title}</div><div className="text-sm opacity-80">{track.artist}</div></div><div className="text-sm">{track.duration}</div></div></div>)}</div></div>
            </div>
          )}
          {activeView==='playlist'&&(
            <div className="space-y-6">
              <div className="flex justify-between items-center"><h2 className="text-2xl font-bold text-white">Music Library</h2><label className="flex items-center gap-2 bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded-lg cursor-pointer transition-colors"><Upload className="w-4 h-4"/>Upload Music<input type="file" multiple accept="audio/*" onChange={handleUpload} className="hidden"/></label></div>
              <div className="space-y-2">{playlist.length===0?<div className="text-center text-purple-200 py-8">No music uploaded yet</div>:playlist.map((track,idx)=><div key={track.id} className="bg-white/10 p-4 rounded-lg"><div className="flex items-center justify-between"><div className="flex-1"><div className="font-semibold text-white">{track.title}</div><div className="text-sm text-purple-200">{track.artist} • {track.duration}</div></div><div className="flex items-center gap-2"><button onClick={()=>moveTrack(idx,'up')} disabled={idx===0} className="text-purple-300 hover:text-white disabled:opacity-30">▲</button><button onClick={()=>moveTrack(idx,'down')} disabled={idx===playlist.length-1} className="text-purple-300 hover:text-white disabled:opacity-30">▼</button><button onClick={()=>handleEditTrack(track)} className="text-blue-400 hover:text-blue-300 p-2"><Edit3 className="w-4 h-4"/></button><button onClick={()=>handleDeleteTrack(track.id)} className="text-red-400 hover:text-red-300 p-2"><Trash2 className="w-4 h-4"/></button></div></div></div>)}</div>
              {editingTrack&&<div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50"><div className="bg-gray-800 rounded-xl p-6 w-full max-w-md"><h3 className="text-xl font-bold text-white mb-4">Edit Track</h3><div className="space-y-4"><div><label className="block text-purple-200 mb-2">Title</label><input type="text" value={editingTrack.title} onChange={(e)=>setEditingTrack({...editingTrack,title:e.target.value})} className="w-full px-4 py-2 bg-white/10 border border-white/30 rounded-lg text-white"/></div><div><label className="block text-purple-200 mb-2">Artist</label><input type="text" value={editingTrack.artist} onChange={(e)=>setEditingTrack({...editingTrack,artist:e.target.value})} className="w-full px-4 py-2 bg-white/10 border border-white/30 rounded-lg text-white"/></div><div className="flex gap-2"><button onClick={handleSaveEdit} className="flex-1 bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg"><Save className="w-4 h-4 inline mr-2"/>Save</button><button onClick={()=>setEditingTrack(null)} className="flex-1 bg-gray-600 hover:bg-gray-700 text-white px-4 py-2 rounded-lg"><X className="w-4 h-4 inline mr-2"/>Cancel</button></div></div></div></div>}
            </div>
          )}
          {activeView==='schedule'&&(
            <div className="space-y-6">
              <h2 className="text-2xl font-bold text-white">Playback Schedule</h2>
              <div className="bg-white/10 p-4 rounded-lg"><h3 className="text-lg font-semibold text-white mb-4">Add New Schedule</h3><div className="space-y-4"><div><label className="block text-purple-200 mb-2">Time</label><input type="time" value={newSchedule.time} onChange={(e)=>setNewSchedule({...newSchedule,time:e.target.value})} className="w-full px-4 py-2 bg-white/20 border border-white/30 rounded-lg text-white"/></div><div><label className="block text-purple-200 mb-2">Days of Week</label><div className="flex gap-2 flex-wrap">{[0,1,2,3,4,5,6].map(day=><button key={day} onClick={()=>toggleDay(day)} className={`px-4 py-2 rounded-lg font-semibold transition-colors ${newSchedule.days.includes(day)?'bg-purple-600 text-white':'bg-white/20 text-purple-200 hover:bg-white/30'}`}>{getDayName(day)}</button>)}</div></div><div><label className="block text-purple-200 mb-2">Action</label><select value={newSchedule.action} onChange={(e)=>setNewSchedule({...newSchedule,action:e.target.value})} className="w-full px-4 py-2 bg-white/20 border border-white/30 rounded-lg text-white"><option value="play">Play</option><option value="pause">Pause</option></select></div><button onClick={handleAddSchedule} disabled={!newSchedule.time||newSchedule.days.length===0} className="w-full bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed"><Plus className="w-4 h-4 inline mr-2"/>Add Schedule</button></div></div>
              <div className="space-y-2">{schedules.length===0&&<div className="text-center text-purple-200 py-8">No schedules configured</div>}{schedules.map(schedule=><div key={schedule.id} className="bg-white/10 p-4 rounded-lg"><div className="flex justify-between items-start"><div className="text-white"><div className="flex items-center gap-2 mb-2"><Clock className="w-5 h-5 text-purple-300"/><span className="font-semibold text-lg">{schedule.time}</span><span className="px-2 py-1 bg-purple-600 rounded text-sm">{schedule.action.toUpperCase()}</span></div><div className="flex gap-1 flex-wrap">{schedule.days.sort((a,b)=>a-b).map(day=><span key={day} className="px-2 py-1 bg-white/20 rounded text-sm">{getDayName(day)}</span>)}</div></div><button onClick={()=>handleDeleteSchedule(schedule.id)} className="text-red-400 hover:text-red-300"><Trash2 className="w-5 h-5"/></button></div></div>)}</div>
            </div>
          )}
          {activeView==='settings'&&(
            <div className="space-y-6">
              <h2 className="text-2xl font-bold text-white">Playback Settings</h2>
              <div className="bg-white/10 p-6 rounded-lg space-y-6">
                <div><label className="block text-white font-semibold mb-2">Silence Between Tracks: {formatSilence(silenceDuration)}</label><input type="range" min="0" max="1800" step="30" value={silenceDuration} onChange={(e)=>setSilenceDuration(Number(e.target.value))} className="w-full"/><div className="flex justify-between text-sm text-purple-200 mt-1"><span>0s</span><span>5m</span><span>10m</span><span>15m</span><span>20m</span><span>25m</span><span>30m</span></div></div>
                <div><label className="block text-white font-semibold mb-2">Max Play Duration: {formatDuration(maxPlayDuration)}</label><input type="range" min="1" max="480" step="1" value={maxPlayDuration} onChange={(e)=>setMaxPlayDuration(Number(e.target.value))} className="w-full"/><div className="flex justify-between text-sm text-purple-200 mt-1"><span>1m</span><span>2h</span><span>4h</span><span>6h</span><span>8h</span></div><p className="text-sm text-purple-200 mt-2">Playback will automatically stop after this duration</p></div>
                <div className="flex items-center justify-between"><div><div className="text-white font-semibold">Fade In/Out Effects</div><div className="text-sm text-purple-200">Smooth transitions between tracks</div></div><label className="relative inline-block w-14 h-8"><input type="checkbox" checked={fadeEnabled} onChange={(e)=>setFadeEnabled(e.target.checked)} className="sr-only peer"/><div className="w-14 h-8 bg-gray-600 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-6 peer-checked:bg-purple-600 after:content-[''] after:absolute after:top-1 after:left-1 after:bg-white after:rounded-full after:h-6 after:w-6 after:transition-all"></div></label></div>
                <div className="flex gap-2"><button onClick={saveSettings} className="flex-1 bg-green-600 hover:bg-green-700 text-white px-4 py-3 rounded-lg font-semibold">Save Settings</button><button onClick={()=>setTotalPlayTime(0)} className="flex-1 bg-blue-600 hover:bg-blue-700 text-white px-4 py-3 rounded-lg font-semibold">Reset Play Time</button></div>
              </div>
            </div>
          )}
          {activeView==='admin'&&currentUser.role==='admin'&&(
            <div className="space-y-6">
              <h2 className="text-2xl font-bold text-white">User Management</h2>
              <div className="bg-white/10 p-4 rounded-lg"><h3 className="text-lg font-semibold text-white mb-4">Add New User</h3><div className="flex gap-2 flex-wrap"><input type="text" placeholder="Username" value={newUser.username} onChange={(e)=>setNewUser({...newUser,username:e.target.value})} className="px-4 py-2 bg-white/20 border border-white/30 rounded-lg text-white placeholder-purple-200"/><input type="password" placeholder="Password" value={newUser.password} onChange={(e)=>setNewUser({...newUser,password:e.target.value})} className="px-4 py-2 bg-white/20 border border-white/30 rounded-lg text-white placeholder-purple-200"/><select value={newUser.role} onChange={(e)=>setNewUser({...newUser,role:e.target.value})} className="px-4 py-2 bg-white/20 border border-white/30 rounded-lg text-white"><option value="user">User</option><option value="admin">Admin</option></select><button onClick={handleAddUser} className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg"><Plus className="w-4 h-4 inline mr-2"/>Add User</button></div></div>
              <div className="space-y-2">{users.map(user=><div key={user.id} className="bg-white/10 p-4 rounded-lg flex justify-between items-center"><div className="text-white"><div className="font-semibold">{user.username}</div><div className="text-sm text-purple-200">Role: {user.role}</div></div><button onClick={()=>handleDeleteUser(user.id)} disabled={user.id===currentUser.id} className="text-red-400 hover:text-red-300 disabled:opacity-30 disabled:cursor-not-allowed"><Trash2 className="w-4 h-4"/></button></div>)}</div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default App;
