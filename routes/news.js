const express=require('express');const {latest,searchNews}=require('../services/news');const router=express.Router();
router.get('/latest',async(req,res)=>{try{res.json({ok:true,items:await latest()});}catch(e){res.status(500).json({error:e.message});}});
router.get('/search',async(req,res)=>{try{const q=String(req.query.q||'').trim();if(!q)return res.status(400).json({error:'Thiếu q'});res.json({ok:true,query:q,items:await searchNews(q)});}catch(e){res.status(500).json({error:e.message});}});module.exports=router;
